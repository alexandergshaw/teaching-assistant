# Infer-and-flag a missing student name on a single submission - scope and wave plan

Owner request (direct chat, 2026-10-08): "if a name is not available for a
single submission, clearly flag it, but also try to infer from the files".

Architecture seat. HEAD ~86df4753, tree has four untracked scope docs and is
otherwise clean. This artifact decides SHAPE and the wave cut; it writes no
production code. Every quantity names the command that produced it. The leverage
call and the acceptance criteria belong to the AC seat (section 11); the oracle
and removal test belong to the test seat.

This feature EXTENDS the just-shipped SUBMISSION-LABELS work (`f6d89ddb`). Read
section 3 first - the precedence top ("explicit label wins") is already built,
and knowing that changes where every other piece lands.

---

## 1. The target path, measured

The owner said "a single submission". A single submission's student name is
derived at exactly one chokepoint, and every single-submission mode funnels
through it or past it:

- **A dropped/picked single file** -> `prepareChatSubmissionAction` ->
  `resolveOnePart` `kind: "file"` -> `buildSingleFileEntry(file.name, buffer)`
  (`src/app/actions/grading-chat-intake.ts:190-195`). `buildSingleFileEntry`
  (`src/lib/grade/single-file-entry.ts:72-133`) sets `student =
  studentLabelFromFileName(name)` (`:77`, defined `:57-63`).
- **A Google Drive single-file URL** -> same action -> `kind: "url"` -> Drive
  branch -> `buildSingleFileEntry(fetched.name, fetched.buffer)`
  (`grading-chat-intake.ts:262`). Same chokepoint.
- **A GitHub repo URL** -> `buildRepoUrlEntry` (`grading-chat-intake.ts:93-108`),
  `student = repo.repo` (the `owner/repo` string). This is a real identifier,
  NOT a generic blob - the predicate (section 4) must leave it alone.
- **A single text paste** -> `buildTextEntry` (`chatSubmissionIntake.ts:71-81`),
  `student = label || "Submission N"`. Text has no file to infer from, and the
  label field has always existed there - out of scope for inference; a blank
  text submission is already the ordinal fallback, not a missing name.

`studentLabelFromFileName` always returns a non-empty string: the trimmed file
stem, or the literal `"Uploaded submission"` when the stem is empty
(`single-file-entry.ts:62`). So "no name" is never an empty `student` today - it
is a `student` that is a word like `submission`, `document`, `essay`, or a bare
id. That is the fact the predicate in section 4 has to turn into a signal.

**So the whole feature lands on the `buildSingleFileEntry` chokepoint plus the
chat driver that applies the label over its result. GitHub-repo and text are
explicitly out: both already carry a usable identity.**

---

## 2. What the engine does with `student` (why the signal can stay off the result)

`result.student` is `entry.student` verbatim at every engine return site -
`src/lib/grade/engine.ts:317,418,434,467,510,523` all read `student:
entry.student` or destructure it from the entry unchanged. The engine invents no
name and strips no field it does not read. The driver sets the final de-duped
`entry.student` BEFORE dispatch (`useContinuousGradingRun.ts:347`), so the key
the row renders under is fixed client-side and equals the driver's own label.

Consequence used throughout this scope: **the "name unresolved" fact is known at
the client driver before the result ever comes back, so it does NOT need to ride
on `GradeResult` or pass through the engine.** It needs only to reach the driver
(on the entry), and the driver surfaces it to the row chat-scoped. This is what
keeps the four non-chat `GradingResults` mounts, the engine, and `GradeResult`
untouched. See section 6.

---

## 3. Precedence - and the half that already shipped

Required order: **explicit label > inferred name > flagged "unnamed".**

The TOP of this chain is already built by SUBMISSION-LABELS (`f6d89ddb`). In the
driver (`useContinuousGradingRun.ts:334-347`):

```
submitLabel = (file|url) && entries.length === 1 ? input.label (trimmed, sliced) : ""
baseStudent = submitLabel.length > 0 ? submitLabel : rawEntry.student
label       = assignUnclaimedLabel(baseStudent, takenLabelsRef.current)   // de-dup
entry.student = label
```

So a typed label ALREADY wins over the server-derived name, guarded to a
single-entry file/url submission so a class zip or whole-Canvas URL can never be
collapsed under one label. This feature inserts the middle and bottom rungs:
`rawEntry.student` becomes "real stem, OR inferred name, OR placeholder", and a
new entry signal tells the driver which. The driver's final decision becomes:

- `submitLabel` present -> `entry.student = label`, **flag OFF** (a labelled row
  is never unresolved, whatever the filename was).
- else inferred name available -> `rawEntry.student = inferred`, flag OFF.
- else -> `rawEntry.student = placeholder`, **flag ON**.

The driver already owns de-dup via `takenLabelsRef` (session-wide), which is why
the label stays applied in the driver and is NOT moved server-side (see
F-GATE fork, section 9).

---

## 4. The "no usable name" predicate (machine-checkable core)

A PURE function over the already-computed stem. Recommended name and home:
`isUnusableStudentName(stem: string): boolean` in `single-file-entry.ts` (the
module that already owns `studentLabelFromFileName`), exported so a frozen oracle
can drive it directly.

**Rule (recommended; the exact word set is the test seat's to freeze as an oracle
axis, section 10).** Normalize the stem: lowercase, trim, drop a trailing
`" (n)"`/`"-n"`/`"_n"` copy counter, then collapse to its alphanumeric tokens.
The name is UNUSABLE when any of:

1. the normalized stem is empty or whitespace only (today's `"Uploaded
   submission"` fallback case);
2. it has NO alphabetic character at all - pure digits or digits+separators
   (a bare Canvas/numeric id, e.g. `1048576`, `2024-10-08`);
3. it matches a UUID/hash shape - 32 hex chars, or 8-4-4-4-12 hex with dashes;
4. its WHOLE token set is a subset of a small generic/placeholder word set:
   recommended starter set `{submission, document, doc, assignment, untitled,
   final, draft, paper, essay, homework, hw, response, reflection, file,
   download, upload, scan, image, img, photo, attachment, export, new, copy,
   output, report}`.

**The load-bearing correctness constraint, and the oracle's hardest axis:** the
predicate matches the WHOLE normalized token set, never a substring. `"Jordan Lee
- reflection"` -> tokens `{jordan, lee, reflection}` is NOT a subset of the
generic set (because `jordan`/`lee` are not in it) -> USABLE -> no flag. This is
pinned already: `single-file-entry.test.ts:70-76` asserts `buildSingleFileEntry
("Jordan Lee - reflection.txt", ...)` yields `student === "Jordan Lee -
reflection"`; the predicate must not regress it. A substring match on
`reflection` would. By contrast `"reflection.txt"` -> `{reflection}` IS a subset
-> UNUSABLE -> flag/infer. `"essay.docx"` -> `{essay}` -> UNUSABLE (and the
existing `single-file-entry.test.ts:53-68` only asserts `student !== "document"`
and non-empty, both still true whether the student becomes an inferred name or
the placeholder - no regression).

False-positive on a real name is a worse failure than false-negative on a
generic one (a flagged real name annoys; a missed generic one is the status quo).
So the set stays SMALL and single-token-dominated; adding a word is a decision
with a cost, recorded as RES-NAME-2.

---

## 5. Inference from the file (recommended: content, not filename)

When `isUnusableStudentName(stem)` is true AND no label suppresses it (section 9),
try to recover a name from the file the app already has in hand.

**What is already in hand.** `buildSingleFileEntry` already extracts the
document's text - `extractTextFromBuffer(name, buffer)` at
`single-file-entry.ts:107`, and the result is in `content` (`:117`). A student's
name very often sits in a header/byline in the first lines ("Name: Jordan Lee",
"Jordan Lee / CS101 / ..."). So content-based inference needs NO second
extraction and no new bytes - it reads the first N characters of `content`.

**Reuse vs new - recommendation: NEW, lightweight, content-based.** Do NOT reuse
`inferFileNameConvention` (`rubric.ts:211-242`). Measured reasons, each opened:

- It infers from a SET of FILENAMES, not from content: its prompt
  (`buildFileNameConventionPrompt(rawFileNames)`, called `rubric.ts:227`) is
  handed filenames and asked for the convention across them. A single generic
  filename is exactly the input it has nothing to work with - the filename is
  why we are here.
- It returns `InferredFileNameLookup { byRaw: Map<rawFileName, {studentDisplay,
  citationFileName}> }` (`types.ts:475-482`) keyed on filenames - the wrong shape
  for "one file, extract a name from its text".
- Its parse DROPS any item missing `studentName` or `assignmentFileName`
  (`rubric.ts:197-199`), so a content-name with no citation filename would be
  discarded.

Recommended NEW seam: `inferStudentNameFromContent(text: string, provider:
LlmProvider): Promise<string | null>` in `single-file-entry.ts`. One `callLlm`
(`src/lib/llm.ts:375`) over the first N chars (recommend N = 2000) at
`temperature: 0`, `maxOutputTokens` small (recommend 60), prompt: "return the
submitting student's name if it is clearly present as an author/byline/header,
else return the single token NONE". Parse: trim; reject `NONE`, an empty string,
anything that itself trips `isUnusableStudentName`, or anything over
`CHAT_LABEL_MAX_CHARS`. Return the name or null. The model ABSTAINS rather than
guesses - a guessed name is a misattribution, which is worse than a flag. Mock
`callLlm` in tests; never `fetch` (`vitest.setup.ts` throws on real fetch,
load-bearing - `docs/loop/tests-are-network-blocked.md`).

**Where it runs: SERVER-side, inside `buildSingleFileEntry`**, which already has
`name`, `buffer`, and the extracted `content`, and already runs server-only
(`extractTextFromBuffer` uses `Buffer`). This requires adding a provider to its
signature (F-INFER-WHERE, section 9). The images branch
(`single-file-entry.ts:79-97`) extracts no text, so content inference cannot run
there - an image with a generic name flags, it does not infer (recorded, not a
gap to fix here - an image byline is OCR, owner-walk).

**Cost, and the gate.** ONE extra `callLlm` per single submission that reaches
the unresolved-and-unlabelled state. Every other submission pays ZERO:

- a real-named file (`isUnusableStudentName` false) never calls it;
- a labelled file/url (section 9's suppression) never calls it;
- a GitHub repo and a text paste never reach `buildSingleFileEntry`;
- a zip/Canvas multi-student submission never reaches it.

The gate is the predicate plus the label-suppression hint. The instrument that
proves the gate holds is a `callLlm` call-count assertion (section 10) - this is
the machine-checkable guarantee that "named/labelled submissions pay nothing".

---

## 6. The flag mechanism

### 6.1 The entry signal (one optional field on a shared type)

Add ONE optional field to `StudentSubmissionEntry` (`src/lib/grade/types.ts:
447-472`). Recommended:

```ts
// Set ONLY by buildSingleFileEntry. Absent (the default on every other
// producer) means "resolved normally" - byte-identical to today, exactly as
// `determination` (types.ts:293) was added without touching other producers.
studentNameSource?: "filename" | "inferred" | "unresolved";
```

- `"filename"` or absent: a usable stem (or a repo/text name) - no flag.
- `"inferred"`: `student` came from content inference - no flag; a surface MAY
  optionally say "name inferred from the document" (owner-walk).
- `"unresolved"`: `student` is a placeholder - **flag**.

`buildSingleFileEntry` is the sole writer. When unusable and inference fails, it
sets `student` to a frozen placeholder (recommend `"Unnamed submission"`) and
`studentNameSource: "unresolved"`. When inference succeeds, `student = inferred`,
`studentNameSource: "inferred"`. Otherwise it sets `"filename"` (or leaves it
absent - decide in F-SIGNAL, section 9).

This field rides on the entry to the route in `GradeRunItemRequestBody.entry`,
where the route and engine simply never read it (no change there). It does NOT
appear on `GradeResult`. The brief's "distinct student value is not enough" is
honored: the placeholder string is not the signal - `studentNameSource` is, and
the placeholder is merely what shows when there is nothing better to show.

### 6.2 The visible flag (chat-scoped, opt-in render)

The driver computes, per dispatched entry, whether the row is flagged:
`flagged = rawEntry.studentNameSource === "unresolved" && submitLabel.length ===
0`, and collects the FINAL de-duped `entry.student` of every flagged row into a
`Set<string>` it exposes (alongside `dispatchedCount` etc). `GradingChatPanel`
passes that set to its `GradingResults` mount (`GradingChatPanel.tsx:415`) and to
`LatestResultCard`.

`GradingResults` gets a new OPT-IN prop, default off, in the exact idiom the
brief named and the file already uses twice -

```ts
/** Opt-in, default off: student display keys whose name could not be resolved
 *  and needs instructor attention. Only the chat grading mount passes it. */
unresolvedStudents?: ReadonlySet<string>;
```

- precedent: `searchable` (`GradingResults.tsx:175-178`) and `onRegrade`
  (`:181-184`), both "Only the chat grading mount passes it". The four non-chat
  mounts (`GithubGradingPanel.tsx:852`, `GradingTab.tsx:568`,
  `LiveFeedPanel.tsx:433`, and the `forwardRef` default) pass nothing and render
  exactly as today.

Render: in the student cell (`GradingResults.tsx:715-719`), beside/under the
name, a VISIBLE label with a frozen literal, the same pattern as
`ungradedRowLabel.ts`'s `UNGRADED_ROW_LABEL` (`:28-35`) - text, not colour alone
(colour fails colour-blind readers and cannot be asserted by any test here;
`ungradedRowLabel.ts:6-8`). Recommended literal: `"Name not found - add a
label"`. The literal lives in a tiny pure leaf (recommend
`grading-results/unresolvedNameLabel.ts`, mirroring `ungradedRowLabel.ts`) so it
is asserted as a text node by a pure test and reused by both render sites.
`LatestResultCard.tsx:35` renders the same literal next to `result.student`.

Because SUBMISSION-LABELS already added the label field to file/url modes, the
flag is directly ACTIONABLE: the owner reads "Name not found - add a label",
re-submits with the label field (or uses the existing Regrade path), and the
precedence in section 3 makes the label win and the flag clear.

### 6.3 Size pressure, handled by extraction

`@(Get-Content src/app/components/GradingResults.tsx).Count` = **996**; ceiling
1000. A new prop (~5 lines incl. doc) + a render branch (~3 lines) crosses it. So
this wave MUST reduce `GradingResults` in the same wave it adds the flag. See
F-SIZE (section 9); recommended disposal is to extract the student cell
(`:715-753`, the name + ungraded label + SpeedGrader link + post/regrade buttons)
into `grading-results/StudentNameCell.tsx`, which both removes more than it adds
AND gives the flag a natural home. Measure the result with `@(Get-Content ...)
.Count` at the wave gate, not from this estimate.

---

## 7. Machine-checkable vs owner-walk

**Machine-checkable (pure oracle / lifecycle driver / wiring; network mocked):**

- The predicate `isUnusableStudentName` - a frozen oracle over axes from a
  DIFFERENT source than the generator (section 10). Hardest axis: real-name
  negatives, including the pinned `"Jordan Lee - reflection"`.
- Precedence `label > inferred > flagged` - a lifecycle driver test
  (`useContinuousGradingRun.lifecycle.test.ts` is the existing home, 76 lines of
  it added by `f6d89ddb`) asserting the three outcomes of section 3 against a
  mocked intake.
- Inference gated to only the unresolved-no-label case - a `vi.mocked(callLlm)`
  call-count assertion: 0 calls for a real name, 0 when a label is present, 0 for
  repo/text, exactly 1 for unresolved-no-label. This IS the "named/labelled pay
  nothing" guarantee.
- The entry carries the signal - a wiring test over `buildSingleFileEntry`'s
  three outcomes (filename / inferred / unresolved) with `callLlm` mocked to a
  name, to `NONE`, and to a failure.
- The frozen visible-label literal - asserted as a string value by a pure test
  (as `ungradedRowLabel.test.ts` does), structure-pinned in
  `GradingChatPanel.structure.test.ts` (the prop is passed).

**Owner-walk (no component renders under vitest - `docs/loop/this-repo.md`
section 6, and the user's own memory):**

- Whether the flag is VISUALLY distinct and legible in both themes, and its
  placement in the real chat results row and the latest-result card.
- Whether content inference actually recovers the RIGHT name from real documents
  (needs a live model/key - this checkout has none). Tests prove the wiring and
  that a returned name is used / an abstention flags; they cannot prove quality.

---

## 8. Serialization

My write set (section 10) intersects three in-flight scopes. Computed by exact
path, these MUST NOT run concurrently with this item:

- **bulk-zip-grading** (`docs/bulk-zip-grading-scope.md`) owns `types.ts`,
  `grading-chat-intake.ts`, `useContinuousGradingRun.ts`, `GradingChatPanel.tsx`
  (its `owns` table, `:36,38,33,34`). Four-file intersection with mine -> HARD
  serialize. Whichever lands first, the other re-briefs from the tree.
- **grading-diagnostics-coverage** (`docs/grading-diagnostics-coverage-scope.md`)
  adds a record call possibly into `grading-chat-intake.ts` and measures
  `GradingResults` at 996 (`:470`). Intersection on `grading-chat-intake.ts` and
  the `GradingResults` line budget -> serialize or coordinate the 996 ceiling
  (two scopes both spending the last 4 lines of that file is a collision neither
  sees alone).
- **zip-upload-lag** (`docs/zip-upload-lag-scope.md`): FIX-1 shipped
  (`86df4753`); remaining owns `GradingTab.tsx`, the `ChatComposer` file handler,
  and `extraction.ts` (`:328-334`). My feature touches NONE of those (the label
  field already exists; the single-file path is `single-file-entry.ts`). Disjoint
  - may run concurrently with this item.

`single-file-entry.ts` and its test, and the two new leaf files, are disjoint
from all three.

---

## 9. Forks, each with a recommendation

**F-INFER-WHERE - where inference runs.**
(a, RECOMMENDED) inside `buildSingleFileEntry`, adding `provider?: LlmProvider`
to its signature; the predicate, inference and signal all live with the naming
logic, one pass, one owner. Cost: `buildSingleFileEntry` gains a model seam (was
pure extraction); its test file must `vi.mock("../llm")`.
(b) in the intake action after `buildSingleFileEntry` returns, reading
`entry.content`. Keeps `single-file-entry.ts` model-free, but splits the naming
decision across two files and re-derives the stem the module already computed.
Recommend (a): cohesion beats the one-line purity note.

**F-GATE - how "labelled pays nothing" is enforced.**
(a, RECOMMENDED) thread the file/url `label` into the intake `FormData` purely as
an inference-SUPPRESSION hint: when present and non-blank, `buildSingleFileEntry`
skips the model call and sets `studentNameSource: "filename"` (flag off). The
driver STILL owns applying the label and session de-dup (unchanged from
`f6d89ddb`). This reverses `f6d89ddb`'s "no FormData change" narrowly and
deliberately - the commit had no reason to send it; this feature does. One-line
additions in `ChatComposer`/driver submit and in `resolveOnePart`.
(b) do not thread the label; run inference whenever the predicate fires, discard
the result when the driver later applies a label. Simpler wiring, but a labelled
submission with a generic filename pays one wasted call - violates the brief's
"labelled pays nothing". Recommend (a).

**F-SIGNAL - shape of the entry field.**
(a, RECOMMENDED) `studentNameSource?: "filename" | "inferred" | "unresolved"` - a
closed union; lets a test and an owner-walk tell "inferred" from "unresolved" and
is the discriminated-construction shape this repo prefers (`types.ts` history).
(b) a bare `studentNameUnresolved?: boolean` - smaller, but loses the "inferred"
distinction the owner's "try to infer" half earns. Recommend (a).

**F-SIZE - making room in `GradingResults` (996/1000).**
(a, RECOMMENDED) extract the student cell (`:715-753`) into
`grading-results/StudentNameCell.tsx`; nets negative lines and homes the flag.
(b) render the flag ONLY in `LatestResultCard` (56 lines, trivial) and skip the
matrix row. Rejected: the owner said flag the ROW, and the matrix is the row.
(c) put the flag in the existing `ungradedRowLabel` union. Rejected: that union
is `RowDisclosureState` about POSTABILITY (`ungradedDisclosure.ts`), a different
axis; overloading it couples two unrelated signals. Recommend (a).

**F-SCOPE-URL - which URL submissions are in scope.** Recommended: only the
Google Drive SINGLE-FILE url (it funnels through `buildSingleFileEntry`), because
GitHub-repo already yields `owner/repo` and Canvas yields rostered names/userIds.
No fork to decide unless the owner wants a repo with a generic name flagged (it
is a real identifier; recommend not).

---

## 10. Wave plan

Two waves. Each wave's file list includes the CALLER of every new export (repo
rule). Line estimates are estimates; the wave gate measures with `@(Get-Content
<file>).Count`.

### Wave 1 - the server core (predicate + inference + signal)

Depends on nothing. Fully machine-checkable; no render.

Write set:
- `src/lib/grade/types.ts` - add `studentNameSource?` to `StudentSubmissionEntry`
  (F-SIGNAL-a). Type-only; every other producer leaves it absent.
- `src/lib/grade/single-file-entry.ts` - add `isUnusableStudentName` (exported),
  `inferStudentNameFromContent` (exported), a frozen placeholder constant;
  thread `provider?` into `buildSingleFileEntry` and set `student` +
  `studentNameSource` across the three outcomes. CALLER of the new params is
  in this wave (next bullet). Imports `callLlm` from `../llm`.
- `src/app/actions/grading-chat-intake.ts` - pass `provider` into the two
  `buildSingleFileEntry` calls (`:191`, `:262`); read the label-suppression hint
  from `FormData` (F-GATE-a) and forward it. This is the caller of the new
  `buildSingleFileEntry` signature - it ships in the same wave, so no dead param.
- `src/lib/grade/single-file-entry.test.ts` - extend (mock `callLlm`).
- NEW `src/lib/grade/single-file-entry.name-oracle.test.ts` - the frozen oracle
  for `isUnusableStudentName`; axes (generic words, numeric, uuid, empty, and
  real-name negatives incl. the pinned case) sourced from a table DIFFERENT from
  the generator.
- NEW `src/lib/grade/single-file-entry.inference-gate.test.ts` - the `callLlm`
  call-count instrument (0 for named/labelled/repo/text, 1 for unresolved).

New exports and their callers, all in-wave: `isUnusableStudentName` (called by
`buildSingleFileEntry`), `inferStudentNameFromContent` (called by
`buildSingleFileEntry`), `buildSingleFileEntry`'s new `provider`/signal (called
by `grading-chat-intake.ts`). No type-only-without-caller escape.

### Wave 2 - the chat-scoped flag render

Depends on Wave 1's `studentNameSource` landing. Re-brief from the tree after
Wave 1.

Write set:
- NEW `src/app/components/grading-results/unresolvedNameLabel.ts` - the frozen
  visible-label literal (mirrors `ungradedRowLabel.ts`).
- NEW `src/app/components/grading-results/unresolvedNameLabel.test.ts` - asserts
  the literal as a text value.
- `src/app/components/GradingResults.tsx` - add the opt-in `unresolvedStudents?`
  prop and render the label in the student cell; extract `StudentNameCell.tsx`
  (F-SIZE-a) in the SAME wave to stay under 1000. CALLER (`GradingChatPanel`) in
  this wave.
- NEW `src/app/components/grading-results/StudentNameCell.tsx` - the extracted
  cell (F-SIZE-a).
- `src/app/components/grading-chat/useContinuousGradingRun.ts` - compute the
  flagged-students `Set` (`studentNameSource === "unresolved" && submitLabel ===
  ""`), expose it. CALLER of the new field; it is the producer of the set the
  panel consumes.
- `src/app/components/grading-chat/GradingChatPanel.tsx` - pass
  `unresolvedStudents` to `GradingResults` (`:415`) and to `LatestResultCard`.
  CALLER of the new prop.
- `src/app/components/grading-chat/LatestResultCard.tsx` - render the literal.
- `src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts` -
  extend with the three precedence outcomes (section 3) and the flag-set.
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` - pin that
  the new prop is passed (the mount's structure guard).

Every new export (`StudentNameCell`, `unresolvedNameLabel`, the
`unresolvedStudents` prop, the driver's set) has its caller in this wave.

### `owns` / impact list

Derived with (run at HEAD ~86df4753):

```
grep -rl "buildSingleFileEntry\|StudentSubmissionEntry\|studentLabelFromFileName\|studentNameSource" src/ --include=*.ts --include=*.tsx
```

That command returns 38 files - most are `StudentSubmissionEntry` TYPE consumers
(engine, routes, embedded-grader, every grading test) that compile against the
widened type but read no new field, so adding an OPTIONAL field leaves them
byte-identical. The EDITED subset is far smaller:

Files this touches as SOURCE (edited) - Wave 1: `src/lib/grade/types.ts`,
`src/lib/grade/single-file-entry.ts`, `src/app/actions/grading-chat-intake.ts`;
Wave 2: `src/app/components/GradingResults.tsx`,
`src/app/components/grading-chat/useContinuousGradingRun.ts`,
`src/app/components/grading-chat/GradingChatPanel.tsx`,
`src/app/components/grading-chat/LatestResultCard.tsx`.

New files: `single-file-entry.name-oracle.test.ts`,
`single-file-entry.inference-gate.test.ts`,
`grading-results/unresolvedNameLabel.ts` (+ test),
`grading-results/StudentNameCell.tsx`.

Files that read my edited files AS SOURCE TEXT (grep a string I own) and could go
red without owning the behaviour - must be in the gate even though unedited:
- `src/lib/grade/single-file-entry.test.ts` (asserts `student` values - section 4
  regression guard).
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` and
  `GradingChatPanel.tsx`'s structure pin (asserts the `GradingResults` mount's
  prop shape - adding a prop can trip it).
- `src/lib/module-graph/runtime-import-graph.test.ts` - `single-file-entry.ts`
  gaining a `../llm` import changes its import trail. MEASURED: `grep -n
  "single-file-entry" src/lib/module-graph/runtime-import-graph.test.ts` returns
  NOTHING - `single-file-entry.ts` is on no frozen trail in this test today, and
  `chatSubmissionIntake.ts:9-16` documents that it is server-only and
  deliberately kept OUT of the client leaf. So the `../llm` import is expected to
  be safe; the wave gate runs this test to verify rather than assume (the file
  froze `engine.ts`'s server-only trails at `:703`, the mechanism a new
  server-only import could disturb).

Multi-path gate command (never a raw multi-path vitest):
```
npm run test:paths src/lib/grade/single-file-entry.test.ts src/lib/grade/single-file-entry.name-oracle.test.ts src/lib/grade/single-file-entry.inference-gate.test.ts src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts src/app/components/grading-chat/GradingChatPanel.structure.test.ts src/app/components/grading-results/unresolvedNameLabel.test.ts src/lib/module-graph/runtime-import-graph.test.ts
```

---

## 11. Leverage note (for the AC seat - not this seat's to rule)

This is feature work a user reaches, so the criteria owe a leverage claim. The
candidate class is **ATTRIBUTION** (`docs/loop/leverage.md:43`): a named output
reaches the right subject by construction, and the app REFUSES to silently
mislabel - it either recovers the name from the submission or flags the row as
needing one, where a chat silently grades whatever was pasted under whatever name
the human happened to type. Candidate removal-test shape (test seat's to build):
delete the `studentNameSource === "unresolved"` branch (or the predicate) and an
unnamed single submission grades under `"submission"`/`"document"` with no flag -
the assertion that the flag-set contains that row's key goes from non-empty to
empty. The removal test is buildable here (pure driver + set), unlike a
clicks/latency advantage. The AC seat decides Redesign/Accept/Reject per
`leverage.md`; this seat only names the class and the line.

---

## 12. Residual register

Each names an owner, an instrument, and the step that measures it. A residual not
in `docs/BACKLOG.md` does not exist (the orchestrator files these):

- **RES-NAME-1 (owner-walk):** visual distinctness and both-theme legibility of
  the flag in the chat row and `LatestResultCard`. Owner: repo owner. Instrument:
  a rendered walk (no component renders under vitest). Step: owner opens the chat
  grading page, submits a generic-named file, confirms the flag is legible in
  light and dark.
- **RES-NAME-2 (decision):** the generic-word set is a judgement call; adding a
  word risks flagging a real name. Owner: repo owner / AC seat. Instrument: the
  name oracle's negative axis. Step: any later addition to the set adds a
  real-name negative case to the oracle in the same commit.
- **RES-NAME-3 (owner-walk):** content-inference QUALITY on real documents needs
  a live model/key absent here. Owner: repo owner. Instrument: live grading run.
  Step: owner grades several real unnamed documents and confirms recovered names.
- **RES-NAME-4 (deferred):** image single submissions with a generic name flag
  but cannot infer (no extractable text; byline is OCR). Owner: whoever next
  touches image ingestion. Instrument: the inference-gate test (asserts 0 model
  calls on the image branch). Step: a future OCR-name pass, if wanted.
- **RES-NAME-5 (not started):** the flag is chat-scoped by construction (opt-in
  prop). If a future non-chat path can produce an unresolved entry, promote the
  signal to a `GradeResult` field and a shared render. Owner: that future path.
  Instrument: a shared-render test. Step: when such a path exists, not before.
