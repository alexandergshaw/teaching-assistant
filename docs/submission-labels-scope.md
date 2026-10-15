# Submission labels - scope and wave plan

Owner request (direct chat, 2026-10-08): "i need the ability to add labels to
any submission." Clarification same day: "similar to how url allows adding
labels" - the owner associates labeling with the existing optional-label field
and wants the SAME field on every submission mode.

Architecture seat. HEAD ~08252c9a, tree clean at scoping. This artifact decides
SHAPE and the wave cut; it writes no production code. Every quantity names the
command that produced it. The leverage call and the acceptance criteria belong
to the AC seat - see section 9.

---

## 1. The resolved reading

**READING A (submit-time label on every mode) is the build.** The owner's
clarification settles it: the feature is "extend the one optional-label field
text already has to the modes that lack it." It is NOT "url already has a label"
- url does not; the owner was recalling the TEXT-mode field. Measured:

- TEXT mode has the field today: `ChatComposer.tsx:286-293`, a `Label
  (optional)` `TextField` bound to the shared `label` state
  (`ChatComposer.tsx:73`), trimmed and passed to `onSubmitText`
  (`ChatComposer.tsx:107`). The driver turns it into `entry.student` via
  `buildTextEntry` (`useContinuousGradingRun.ts:264` -> `chatSubmissionIntake.ts:71-81`),
  sliced to `CHAT_LABEL_MAX_CHARS = 500` (`chatSubmissionIntake.ts:56,74`).
- COMPOSITE has its own single label: the `Student name` field
  (`ChatComposer.tsx:253-261`), sliced to `CHAT_LABEL_MAX_CHARS` at
  `useContinuousGradingRun.ts:285-288`. Leave it as is.
- FILE mode has NO label field. Its only control is the `Add files` button
  (`ChatComposer.tsx:227-234`); a picked/dropped file submits immediately with a
  server-derived student (filename).
- URL mode has NO label field. Its only control is the URL `TextField`
  (`ChatComposer.tsx:335-351`); the student is derived server-side from the
  resolved resource.
- RECORD mode needs no field: it only feeds the composite tray
  (`ChatComposer.tsx:90-92,305-333`) and is graded through the composite path,
  which already carries `Student name`. No change.

So the feature = **add the existing optional-label field to FILE and URL modes**
(text has it; composite and record are already covered), and make a blank field
fall back to today's derived name byte-for-byte.

**READING B (post-hoc rename of a graded row) stays a FORK**, not this build -
see section 8. It is a different surface and carries an identity-key hazard the
submit-time label does not.

---

## 2. Where the label overrides the student: THE DRIVER, not the intake

Recommendation: apply the label override **client-side in the driver**
(`useContinuousGradingRun.ts`), not in the server intake action
(`grading-chat-intake.ts`). Reasons, each checkable:

1. **One place covers file AND url.** Both non-text modes return through the
   same branch: `entries = outcome.entries` (`useContinuousGradingRun.ts:313`).
   The override sits just before the de-dup loop at `:330-337` and covers both.
2. **The driver already owns student-naming.** `assignUnclaimedLabel`
   (`grade/utils.ts:420-428`) runs at `useContinuousGradingRun.ts:335` to
   de-duplicate display names across the session (`takenLabelsRef`). Putting the
   label-to-student step immediately upstream of that keeps all student-naming
   in one function, and the de-dup still runs on the labelled value for free.
3. **No wire change, no new server surface.** The intake action is a
   `"use server"` file guarded by `requireAppOwner()`
   (`grading-chat-intake.ts:69,132,299`) and tracked by the guard-coverage
   canaries (section 7). Threading a label into FormData would be a new wire
   field the security seat must re-clear. The driver override needs none: it
   reuses `CHAT_LABEL_MAX_CHARS` (already imported, `:36`) for the slice, and
   the route's existing `MAX_STUDENT_CHARS = 500` check at
   `src/app/api/grade-run-item/route.ts:88-90` remains the server-side backstop
   on the dispatched `entry.student`.
4. **Consistency with text.** Text already overrides client-side in the driver
   (`buildTextEntry` at `:264`). File/url overriding in the same function makes
   the driver the single owner of "optional label -> `entry.student`."

The intake action (`grading-chat-intake.ts`) is therefore **UNCHANGED** by this
build. Its existing `label` read at `:138` is the text-path testability seam and
stays.

### The override rule (driver), stated so the bad state is unrepresentable

Apply the label as the base student **only when the submission resolves to
exactly one entry**:

```
base = (label?.trim() && entries.length === 1)
         ? label.trim().slice(0, CHAT_LABEL_MAX_CHARS)
         : rawEntry.student
then: student = assignUnclaimedLabel(base, takenLabelsRef)   // unchanged de-dup
```

The `entries.length === 1` guard is load-bearing: a FILE submission can be a ZIP
(`grading-chat-intake.ts:196-199`, `extractStudentEntries` -> many entries) and
a URL submission can be a whole Canvas assignment
(`grading-chat-intake.ts:216-224`, `extractCanvasEntries` -> many entries).
Collapsing N distinct students to one label is the exact misattribution
`grade/collisionRefusal.ts` exists to refuse (leverage class ATTRIBUTION). When
the outcome is multi-entry, the label is ignored and each entry keeps its
derived student.

---

## 3. Per-mode field placement

Reuse the TEXT-mode field verbatim as the template: a small optional
`TextField` with `className={chatStyles.composerLabel}` (`flex: 0 1 180px`,
`grading-chat.module.css:66-68`), `label="Label (optional)"`, bound to the
shared `label` state (`ChatComposer.tsx:73`) - the same state text uses, so the
three modes share one field, one clear path, one slice.

- **URL mode** (`ChatComposer.tsx:335-351`): add the label `TextField` into the
  existing url `adaptRow`, between the URL field and the `Add` button, mirroring
  text's `[field][label][button]` order. Result: `[url][Label (optional)][Add]`.
- **FILE mode**: file mode has no `adaptRow` - its control is the `Add files`
  button inside the `ghActions` row (`ChatComposer.tsx:227-234`), and a pick/drop
  submits immediately (no Send button). The label must be typed BEFORE the pick,
  so place the label `TextField` adjacent to `Add files` inside that same
  `ghActions` block, both gated on `mode === "file"`. (The architect/UX follow-up
  may instead give file mode its own `adaptRow`; either is acceptable as long as
  the field is visible at the point of action. Recommend the in-`ghActions`
  placement - it avoids an otherwise-empty row and keeps the trigger and its name
  together.)

Optionality and default: the field is optional. Blank -> today's derived name,
byte-identical (the driver's `label?.trim()` guard short-circuits to
`rawEntry.student`). The label is transient: **no new `ta-` key, no
persistence** - section 7 shows the storage-key canary stays green only if no
key is added, which this design honors.

Clearing: clear the shared `label` state after each successful file/url submit,
exactly as `handleSendText` does (`ChatComposer.tsx:107,110`).

---

## 4. The multi-file decision

Two distinct "multi" cases, both resolved by "a label names ONE student's ONE
submission":

**Case A - file mode, N files picked/dropped at once.** Each file is a SEPARATE
`driver.submit({kind:"file", file})` call: `handleSubmitFiles` loops through
`submitFilesSequentially` (`GradingChatPanel.tsx:240-251`, `chatFileBatch.ts:6-15`).
One label field applied to all N would name N different students the same thing
(then suffixed "X", "X (2)", "X (3)" by de-dup) - the misattribution shape
above. **Recommendation: the label applies only when exactly one file was
submitted; with N > 1 the label is dropped and each file keeps its filename.**
Enforce at the panel seam, which is the only place that knows the batch size:
`handleSubmitFiles(files, label)` forwards the label to `driver.submit` only
when `files.length === 1`, else `undefined`.

**Case B - a single file that is a ZIP, or a single Canvas URL for a whole
assignment.** One submit, many entries. Handled by the driver's
`entries.length === 1` guard (section 2): the label is ignored, per-file/per-
student derived names are kept.

**Whole-view drop** (`GradingChatPanel.tsx:288-294`, `handlePanelDrop`) bypasses
the composer and has no label field in reach; it submits with no label
(filename fallback). The composer's own drop (`ChatComposer.tsx:180-191`) has
the `label` state available and SHOULD pass it on a single-file drop, so pick
and in-composer drop behave the same; the panel's `files.length === 1` guard
makes multi-file drops fall back regardless.

The owner addressed only the single-submission case. This is the one genuine
in-Reading-A choice - record it for the owner (section 8, Fork F2): the
alternative is to let all N share the label and rely on de-dup suffixing. The
recommendation is the attribution-preserving fallback-to-filenames.

---

## 5. The CHAT_LABEL_MAX_CHARS bound

Every new label path slices to `CHAT_LABEL_MAX_CHARS = 500`
(`chatSubmissionIntake.ts:56`), the same bound text (`:74`) and composite
(`useContinuousGradingRun.ts:285-288`) already apply, which itself mirrors the
route's `MAX_STUDENT_CHARS` (`grading-chat-intake.ts:53-56` comment;
`route.ts:88-90`). The slice happens in the driver override (section 2), so SEC-
GC-4's graceful-degradation treatment (truncate, do not fail closed) extends to
file/url labels unchanged.

---

## 6. Machine-checkable vs owner-walk

**Machine-checkable** - driver-level behaviour, through the no-render lifecycle
harness that mocks the intake action (`useContinuousGradingRun.lifecycle.test.ts:44-51`)
and captures the dispatched body via `dispatchItemMock` (`:84`). These read
`dispatchItemMock.mock.calls[i][0].entry.student`:

1. FILE submission, mock intake returns 1 entry, label `"X"` -> dispatched
   `entry.student === "X"`.
2. FILE submission, blank/undefined label -> `entry.student ===` the mock's
   derived student (filename passes through unchanged).
3. FILE submission, label of 600 chars -> `entry.student.length === 500`.
4. Two FILE submissions both label `"X"` -> `"X"` then `"X (2)"` (de-dup intact).
5. FILE or URL submission, label `"X"`, mock intake returns 2 entries (zip /
   multi-Canvas) -> both entries keep their derived students; neither is `"X"`.
6. URL submission, mock returns 1 entry, label `"X"` -> `entry.student === "X"`.
7. Default-wire canary: a file/url submission with NO label produces a dispatched
   body byte-identical to today (proves the absent-label path is unchanged).

**Panel-seam source pins** (GradingChatPanel.structure.test.ts, source-text):

8. `handleSubmitFiles` forwards the label to `driver.submit` only inside a
   `files.length === 1` guard (Case A).
9. `ChatComposer` declares the label field for file and url modes and threads it
   into `onSubmitFiles` / `onSubmitUrl`.

**Owner-walk only** (no component renders under vitest - `this-repo.md` s.6):
the label `TextField` actually appears on screen in file and url modes; typing a
label and submitting shows the row under that name; a blank field shows the
derived name; a multi-file pick shows filenames. These are reading/owner claims,
recorded as residuals RG-LABEL-W1 in section 10.

---

## 7. The `owns` file list

Derived with: `grep -rn "onSubmitFiles\|onSubmitUrl\|ChatComposer\|useContinuousGradingRun\|chatSubmissionIntake\|grading-chat-intake" --include=*.test.ts src`
plus `@(Get-Content <f>).Count` for sizes (PowerShell, 2026-10-08).

**Production files edited** (sizes measured, all far under the 1000 ceiling
`file-size-ceiling.structure.test.ts:41`; the feature adds ~10-25 lines each):

| File | Lines | Change |
|---|---|---|
| `src/app/components/grading-chat/ChatComposer.tsx` | 356 | add label field to file+url modes; `onSubmitFiles`/`onSubmitUrl` prop signatures gain `label` |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | 470 | `handleSubmitFiles`/`handleSubmitUrl` forward label; `files.length === 1` guard |
| `src/app/components/grading-chat/useContinuousGradingRun.ts` | 442 | `submit()` applies the label override when `entries.length === 1` |
| `src/app/components/grading-chat/chatSubmissionIntake.ts` | 137 | `ChatSubmissionInput` file+url variants gain `label?: string` (`:26-30`) |

**Tests that read the edited files AS SOURCE TEXT - in-wave, or a correct change
goes red:**

- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` (716 lines):
  **line 536 `expect(pick).toContain("onSubmitFiles(files)")` BREAKS** the moment
  `handlePickFile` becomes `onSubmitFiles(files, ...)` - the closing paren no
  longer follows `files`. This assertion MUST be updated in-wave, and the new
  file/url label source-pins (section 6 items 8-9) added here. The composite-W2
  prop-name pins at `:506-510,488-489` still match (prop names unchanged).
- `src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts` (713 lines):
  new driver tests (section 6 items 1-7) land here.
- `src/app/components/grading-chat/chatSubmissionIntake.test.ts` (155 lines):
  optional - only if adding a type-level/`buildTextEntry` assertion; the type
  change alone does not break it.

**Canaries that must RUN in the wave gate (they do not run at push -
`this-repo.md` s.1 "pre-push gate runs NO vitest"):**

- `src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts`:
  frozen `ta-` key set (`:13-20`). This design adds NO key, so it stays green -
  BUT it scans the whole directory's raw source (`:30-37`), so running it proves
  no stray `ta-` literal slipped in. Include it.
- `src/file-size-ceiling.structure.test.ts`: unconditional, every wave.

**Checked-safe, NOT in the owns set** (matched the grep but this design does not
touch their subject):

- `src/app/actions/grading-chat-intake.test.ts`,
  `src/app/actions/action-guard-coverage-github-cohort.test.ts`,
  `src/app/actions/wholesale-auth-mock-population.structure.test.ts`,
  `src/tools/backlog/backlog-file.structure.test.ts`: these track the server
  action `grading-chat-intake.ts` (its exports / `requireAppOwner` guards). The
  recommended design leaves that file UNCHANGED, so they stay green. **If a
  later revision moves the override into the intake action instead, these three
  re-enter the owns set.**

Wave-gate command (two-plus paths -> `test:paths`, never a raw multi-path
vitest, `this-repo.md` s.1):

```
npm run test:paths src/app/components/grading-chat/GradingChatPanel.structure.test.ts \
  src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts \
  src/app/components/grading-chat/chatSubmissionIntake.test.ts \
  src/app/components/grading-chat/grading-chat-storage-keys.structure.test.ts \
  src/file-size-ceiling.structure.test.ts
```

plus `npx tsc --noEmit` and `npm run lint` (exit 0, no NEW warning in the
written files - do not pin the warning count, `this-repo.md` s.1).

---

## 8. Forks (recommendations, for the owner/orchestrator to settle)

- **F1 - READING B, post-hoc row rename (FORK, recommend: follow-up, not now).**
  Letting the instructor rename a label on an already-graded row in
  `GradingResults`. Heavier and risky: `entry.student` is the identity key for
  the edits map, the regrade lookup (`useContinuousGradingRun.ts:382-389`
  resolves `student -> sourceIndex` through `retainedBodiesRef`), the post
  status, and the de-dup set (`takenLabelsRef`). Renaming mid-session would
  desync those keys. Not required to satisfy "add labels to any submission,"
  which Reading A delivers at submit time. Recommend filing as its own backlog
  row with the identity-key hazard flagged; do not fold into this wave.
- **F2 - multi-file label behaviour (in-Reading-A choice, recommend:
  fallback-to-filenames).** Section 4 Case A. Recommend the label applies only
  to a single-file submission; the alternative (share the label across N files,
  rely on de-dup suffixing) is recorded so the owner can overrule. This is a
  one-line panel guard either way.
- **F3 - mode-switch label retention (minor, recommend: leave it).** Reusing the
  shared `label` state means a label typed in text mode persists if the user
  switches to url mode before submitting. Harmless and transient; recommend no
  special clearing on mode switch. Flag only.

---

## 9. For the AC seat: the leverage call is owed and is NOT mine to default

This is feature work (a capability a user reaches), so the criteria document
owes a LEVERAGE CLAIM (`DEV_LOOP.md`, "The loop / Criteria";
`docs/loop/leverage.md`). My read, to be confirmed or overruled by AC + owner,
never defaulted by me: the label field itself is **thin / click-cost**. The
re-addressable, session-held results table keyed by `entry.student` (which feeds
regrade, edits and post status, and which a chat has no equivalent of) is real
ATTRIBUTION/CORPUS leverage, but it is INHERITED from the existing chat surface,
not EARNED by this field - the field only sets the key the surface already
holds. Per `leverage.md`'s negative-example framing, the honest call is most
likely "**accept the cost explicitly**" (state that the advantage is naming
convenience feeding the existing keyed record), not "redesign" or "reject." A
removal test here would be clicks/attention-shaped, which no vitest in this repo
can observe (no component renders) - so the removal test is likely unbuildable
and becomes a residual with an owner and a step (`seats.md`, Test seat). AC and
the owner decide the three-way call; I only flag it.

---

## 10. Residual register

Each has an owner, an instrument, and the step that measures it. A residual not
in `docs/BACKLOG.md` does not exist - file these at disposal.

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RG-LABEL-W1 | The label field renders in file+url modes; blank -> derived name; typing -> row under that name; multi-file pick -> filenames | owner | live app walk (no component renders under vitest) | owner verification after W1 ships |
| RG-LABEL-LEV | Leverage claim is likely click-cost only; the three-way call (accept/redesign/reject) and whether a removal test is buildable | AC seat + owner | `docs/loop/leverage.md` procedure | AC round for this item |
| RG-LABEL-F1 | Reading B (post-hoc row rename) with the identity-key hazard | orchestrator | backlog row | file as a separate row; not this wave |
| RG-LABEL-F2 | Multi-file label behaviour: fallback-to-filenames (recommended) vs shared-label | owner | panel `files.length === 1` guard | owner confirm; default to recommendation if silent |

---

## 11. Wave plan - ONE wave

The change is a single disjoint write set with its caller in-wave (no dead
export): the composer field and prop-signature additions, the panel's label
forwarding + `files.length === 1` guard, the `ChatSubmissionInput` type
extension, and the driver override all land together, with the lifecycle and
structure tests in the same wave (section 7). No migration, no persisted-key
change, no new server surface - nothing here is non-trivially revertible
(`seats.md`, Architect checker). Serialization note: this is the next
composer/driver change after the shipped regrade + feedback-length W2 (tree
clean, no live collision); any future composer/driver work serializes behind it
because it edits the same four files.

**W1 - submit-time labels on file and url modes.**
Write set (exact paths): `ChatComposer.tsx`, `GradingChatPanel.tsx`,
`useContinuousGradingRun.ts`, `chatSubmissionIntake.ts`,
`GradingChatPanel.structure.test.ts`, `useContinuousGradingRun.lifecycle.test.ts`,
`chatSubmissionIntake.test.ts` (all under `src/app/components/grading-chat/`).
Caller-in-wave: `ChatComposer` (the caller of the new prop shapes) and
`GradingChatPanel` (the caller of the composer) are both in the set. The type
extension in `chatSubmissionIntake.ts` is consumed by the driver and the
composer, both in the set.

Gate: the `npm run test:paths ...` command in section 7, plus `tsc` and `lint`.
Verify: exercise section 6 items 1-9, rule on the triaged-out seats against the
built diff, and re-judge the leverage claim (RG-LABEL-LEV) against what shipped.
