# GRADING-CHAT composite submission - scope and wave plan

Owner request (direct chat, 2026-10-06), verbatim:
"i also need to be able to have a composite submission for one student - i.e.
support cases where they submit a file, a url, and/or more"

**Meaning adopted** (from the dispatch brief, confirmed against the tree): today
each submission mode (one text paste, one file, one URL) grades independently and
appends a SEPARATE row. A composite submission lets the instructor assemble
MULTIPLE parts (text AND/OR one-or-more files AND/OR one-or-more URLs) that belong
to ONE student, and grade them together as ONE effort producing ONE row with ONE
`sourceIndex` / one dispatched item.

This is the architecture/scoping artifact. It designs the SEAM (the type contract
+ the pure merge function every later wave is built against), not production code.
Every structural claim cites `file:line`; every quantity names its command.

---

## 0. Measured facts (commands pasted, not recalled)

Line counts - `@(Get-Content <file>).Count` (PowerShell), run 2026-10-06:

| File | Lines | Ceiling headroom |
|---|---|---|
| `src/app/components/grading-chat/chatSubmissionIntake.ts` | 70 | large |
| `src/app/actions/grading-chat-intake.ts` | 257 | large |
| `src/app/components/grading-chat/useContinuousGradingRun.ts` | 378 | large |
| `src/app/components/grading-chat/ChatComposer.tsx` | 203 | large |
| `src/app/components/grading-chat/GradingChatPanel.tsx` | 244 | large |
| `src/lib/grade/single-file-entry.ts` | 133 | large |
| `src/lib/grade/utils.ts` | 581 | moderate - DO NOT grow materially |
| `src/lib/grade/extraction.ts` | 546 | moderate |
| `src/lib/grade/types.ts` | 470 | large |
| `src/app/components/grading/incrementalRunPlan.ts` | 301 | large |
| `src/app/components/grading-chat/grading-chat.module.css` | 165 | large |

No file this reshape edits is near the 1000-line ceiling. `utils.ts` (581) and
`extraction.ts` (546) are the two to keep OFF the edit path - and this design
does, by reusing them unchanged.

Cross-scope status, re-measured 2026-10-06 at HEAD d08d0fc4:
- **gdrive-url has SHIPPED** (`git log --oneline -1 b9f27f5e` ->
  `feat(GDRIVE-URL): accept Google Drive sharing links in the grading-chat URL mode`).
  `git show --stat b9f27f5e` shows it touched `src/app/actions/grading-chat-intake.ts`
  (+49 lines, 210 -> 257) and three `google-drive*` lib files - it did NOT touch
  `ChatComposer.tsx` (still 203, same instrument). The Drive branch is live at
  `grading-chat-intake.ts:213-248` (opened). So gdrive is no longer an in-flight
  concurrent scope; it is a COMMITTED baseline this scope re-bases onto (section 11).
- controls and visual remain in-flight. Cross-scope ordering (section 11) is written
  against their described write-sets, not their text.

New symbols are collision-free: `grep -rln "mergeCompositeEntries|CompositePartInput|prepareCompositeSubmissionAction|resolveOnePart" src`
returns nothing (2026-10-06).

---

## 1. The seam as it exists today (verified + opened)

### 1.1 The taxonomy leaf (the type contract to reshape)

`src/app/components/grading-chat/chatSubmissionIntake.ts` is the pure,
client-safe leaf. It is importable from BOTH the server action and the client
driver because it is synchronous, side-effect-free, and imports no server-only
module (its header comment, `:1-17`, states this and names
`runtime-import-graph.test.ts` - `src/lib/module-graph/runtime-import-graph.ts`
exists - as the guard that keeps it so).

- `ChatSubmissionInput` (`:25-28`): a 3-member discriminated union -
  `{kind:"text"; label?; content}` | `{kind:"file"; file:File}` | `{kind:"url"; url}`.
- `IntakeOutcome` (`:38-40`): `{kind:"entries"; entries: StudentSubmissionEntry[]; pointsPossible: number|null}` |
  `{kind:"refused"; reason}`.
- `buildTextEntry(input, ordinal)` (`:60-70`): shows an entry's shape; always
  produces a non-empty `student` (defaults `Submission <ordinal>`), sliced to
  `CHAT_LABEL_MAX_CHARS = 500` (`:45,63`), `mergedFileCount: 0`,
  `submittedFiles: []`.

### 1.2 The merged-entry type (what every path resolves to)

`StudentSubmissionEntry` (`src/lib/grade/types.ts:424-444`, opened):
`student`, `content`, `mergedFileCount: number`, `submittedFiles: SubmittedFileInfo[]`,
plus optional single-source provenance fields `userId?`, `codeRun?`,
`submissionUrl?`, `gradedRepo?`, `gradedRef?`.
`SubmittedFileInfo` (`types.ts:119-126`, opened): `name`, `extension`,
`previewContent`, `previewTruncated`, `rawBase64?`, `mimeType?`.

### 1.3 Where multiple files ALREADY merge into one entry (the merge precedent)

Two existing sites merge many files into ONE `StudentSubmissionEntry`. They AGREE
on the content format (separator + per-part header) but they DIFFER on
`mergedFileCount`, so this design does not claim to mirror one settled convention -
it adopts the content format both share and justifies its own count rule on its own
terms (section 4 rule 4).

**Zip path** - `groupSubmissionsByStudent` (`src/lib/grade/utils.ts:439-537`,
opened):
- `content` (`:509-515`): each file rendered `File: <citationFileName>\n\n<content>`,
  joined with the separator `"\n\n---\n\n"`.
- `submittedFiles` (`:517-529`): one `SubmittedFileInfo` per file, with
  `name` guaranteed unique by `parseSubmissionFileName`/the A44 terminal
  disambiguation pass (`:467-500`).
- `mergedFileCount` (`:534`, opened): `entry.files.length` - FILES ONLY (a zip has
  no text part, so there is nothing else to count).

**Canvas path** - `canvasWorkToEntry` (`src/lib/grade/extraction.ts:390-545`,
opened):
- `content` (`:537`): `contentParts.join("\n\n---\n\n")` where each part is raw
  text, or `File: <name>\n\n<extracted>` (`:513`), or `Submitted link: <url>`
  (`:439`), or a `GitHub repository code (...)` block (`:463-465`).
- `submittedFiles`: union of per-file plus pseudo-files ("Submission text"
  `:423`, "Submission link" `:441`).
- `mergedFileCount` (`:538`, opened): `Math.max(1, work.files.length + (work.text ? 1 : 0))`
  - files PLUS a text-indicator (+1 when the submission had text), FLOORED at 1 so a
  text-only Canvas submission still reports `1`.

**Where they agree:** separator `"\n\n---\n\n"` (`utils.ts:515` / `extraction.ts:537`,
both opened), a per-part header line, and `submittedFiles` unioned in order with
unique names. The composite content format extends exactly this across kinds.

**Where they DIFFER (and why composite does not copy either verbatim):**
`mergedFileCount` is NOT a shared convention - zip counts files only (`:534`), Canvas
counts files + a text-indicator with a `Math.max(1, ...)` floor (`:538`). Composite's
rule is justified on its own terms in section 4 rule 4, not as a mirror of two
agreeing sites.

### 1.4 The server resolver (per-submission)

`prepareChatSubmissionAction(formData)` (`src/app/actions/grading-chat-intake.ts:114-210`,
opened): reads a `kind` discriminator, resolves to `IntakeOutcome`.
- `requireAppOwner()` first statement (`:115`).
- text -> `buildTextEntry`, 1 entry (`:120-128`).
- file -> `classifyGradingUpload` (`single-file-entry.ts:36-45`): a non-zip
  supported file is `"single"` -> `buildSingleFileEntry`, exactly 1 entry
  (`:150-155`); a `.zip` is `"zip"` -> `extractStudentEntries`, 0..N entries
  (`:156-159`).
- url -> Canvas (`detectCanvasUrlKind`) -> `extractCanvasEntries`, 0..N entries
  (`:176-189`); else GitHub repo (`parseSubmissionGithubUrl`) ->
  `buildRepoUrlEntry`, exactly 1 entry (`:191-201`); else refused (`:203-206`).
- Oversize is enforced by `firstOversizedEntryReason(entries)` (`:96-103`):
  refuses when any entry's `estimateEntryWireBytes` (`incrementalRunPlan.ts:82-88`:
  `content.length + sum(submittedFiles[].rawBase64.length)`) exceeds
  `ITEM_REQUEST_BYTE_BUDGET` (`incrementalRunPlan.ts:42` = `UPLOAD_WIRE_BUDGET_BYTES`
  = `3.5 * 1024 * 1024`, `src/lib/upload-budget.ts:41`).

**Per-kind entry cardinality (the governing fact for the whole design):**

| Part kind | Resolver | Entries produced |
|---|---|---|
| text | `buildTextEntry` | exactly 1 |
| file (non-zip supported) | `buildSingleFileEntry` | exactly 1 |
| file (.zip) | `extractStudentEntries` | 0..N (a whole class) |
| url (GitHub repo) | `buildRepoUrlEntry` | exactly 1 |
| url (Canvas) | `extractCanvasEntries` | 0..N (a whole class) |

`CanvasUrlKind` is only `"discussion" | "assignment"` (`src/lib/canvas-url.ts:8`,
opened) - BOTH grade a whole class. There is no single-student Canvas URL kind in
this tree. This is why the one-entry invariant (section 4, Fork A) is the clean
rule and the owner's "restrict to single-submission URLs" alternative has no
single-submission Canvas URL to admit.

### 1.5 The driver

`useContinuousGradingRun.ts` (opened). `submit(input: ChatSubmissionInput)`
(`:233-325`) resolves `input` to `entries`, then (`:290-310`) dispatches ONE
queued item per admitted entry, each with its own `sourceIndex`
(`dispatchedCountRef.current`), de-duping the display name via
`assignUnclaimedLabel` (`utils.ts:420-427`: suffixes `" (2)"`, `" (3)"`).
`runKey` is per-SESSION (`"grading-chat-" + sessionId`, `:365`); a row's identity
is its `sourceIndex`. So **one entry in `entries` == one dispatched item == one
row.** A composite that resolves to ONE merged entry therefore produces ONE row
with no change to the dispatch loop.

### 1.6 The composer and panel

`ChatComposer.tsx` (opened): `SegmentedToggle` over `text|file|url` (`:129-149`);
each mode's primary control submits IMMEDIATELY via `onSubmitText`/`onSubmitFiles`/
`onSubmitUrl` (`:73-98`). Enter-to-send lives in `slotProps.input.onKeyDown` for
the multiline text field (`:164-166`) and as a top-level `onKeyDown` for the
single-line URL field (`:191`) - two different, already-proven conventions.
`GradingChatPanel.tsx` (opened): owns instructions/rubric, calls `ensureSession`
then `driver.submit({kind})` in three handlers (`:131-158`).

---

## 2. Leverage (candidate class for the Acceptance-criteria seat)

This reshape is feature work, so a leverage claim is owed - but the claim is the
AC seat's to author (`seats.md` Acceptance criteria). This section only NAMES the
candidate class and the removal-test candidate so the AC and test seats inherit a
starting point; it is a residual (RES-GC-CMP-LEV), not a finished claim.

Candidate class: **ATTRIBUTION** (`docs/loop/leverage.md:43`), compounded with
SCALE. A chat window grades each pasted artifact independently; nothing in a
transcript binds a file, a URL and a text block to ONE named student and grades
them as one effort. The composite makes "these N artifacts are ONE student's
submission, named by construction, graded once" a typed fact the code holds.
Removal-test candidate (for the test seat): the merge produces exactly ONE entry
whose `student` is the explicitly-provided name and whose `content` carries all N
parts - delete the merge (dispatch the parts as N separate entries) and a
machine-checkable assertion that `mergeCompositeEntries(...).mergedFileCount`
equals the summed part count, and that the result is a single entry, goes RED.
This is buildable here (pure function, no render). The AC seat must still run the
earned-vs-inherited check and decide Redesign/Accept/Reject per leverage.md.

---

## 3. The reshaped type contract (the loop-top seam)

In `chatSubmissionIntake.ts`. Additive only - the three existing members are
byte-unchanged, so every existing `submit`/test path is untouched.

```ts
/** One part of a composite submission. Each part resolves to EXACTLY ONE
 *  entry (see mergeCompositeEntries / Fork A); a part that would resolve to
 *  zero or many (a .zip, a Canvas class URL) is refused by name, never merged.
 *  Note `file` is a SINGLE File: "one or more files" is expressed as multiple
 *  file parts, which keeps the one-entry-per-part invariant structural. */
export type CompositePartInput =
  | { readonly kind: "text"; readonly content: string }
  | { readonly kind: "file"; readonly file: File }
  | { readonly kind: "url"; readonly url: string };

export type ChatSubmissionInput =
  | { readonly kind: "text"; readonly label?: string; readonly content: string }
  | { readonly kind: "file"; readonly file: File }
  | { readonly kind: "url"; readonly url: string }
  | { readonly kind: "composite"; readonly student: string; readonly parts: readonly CompositePartInput[] };
```

`student` is carried on the composite member because a composite blends sources
with no single natural label (a text part auto-labels `Submission N`, a file
auto-labels from its filename stem, a repo from its name - none of these is "the
student"). Naming it once at the union level is the ATTRIBUTION mechanism, and it
is where the instructor's single name-entry (section 5) lands.

---

## 4. The pure MERGE function (the crux - machine-checkable, frozen oracle)

Lives in `chatSubmissionIntake.ts` (client-safe leaf) because it operates only on
already-resolved `StudentSubmissionEntry` data (plain strings/arrays) - no Buffer,
no fetch, no server import, so `runtime-import-graph.test.ts` stays green and the
function is unit-testable in node.

```ts
export function mergeCompositeEntries(
  resolvedParts: readonly StudentSubmissionEntry[],
  student: string
): StudentSubmissionEntry
```

**Exact semantics** (mirroring section 1.3's established convention; each rule is
an oracle row):

1. **student identity** - the result's `student` is the `student` argument
   verbatim (not derived from any part). Each part's own `.student` is DISCARDED
   for identity but preserved in the content header (rule 2) as provenance. The
   driver still runs `assignUnclaimedLabel` over this name for cross-row
   uniqueness, exactly as for every other entry (`useContinuousGradingRun.ts:295`).
   Precondition: callers pass a non-empty `student`; the driver guarantees this by
   defaulting a blank name to `Submission <ordinal>` (section 5), so the never-empty
   invariant `buildTextEntry` holds (`chatSubmissionIntake.test.ts` "never produces
   an empty student label") is preserved. `mergeCompositeEntries` itself does NOT
   re-default - one owner of the defaulting rule, in the driver.

2. **content** - join the parts in input order with the separator `"\n\n---\n\n"`
   (the exact literal both existing sites use, `utils.ts:515` / `extraction.ts:537`).
   Each part is prefixed with a header line naming its 1-based ordinal and its
   source label, e.g.:
   `Part <i> - <part.student>:\n\n<part.content>`.
   Rationale: the zip/Canvas sites front-load a `File: <name>` / `Submitted link:`
   header so the grader sees provenance and the prefix survives
   `truncateSubmission`'s blind slice (`utils.ts:510-513`, the discussion-manifest
   note at `extraction.ts:299-302`). The exact header string is pinned by the
   oracle; the test seat owns its final wording.

3. **submittedFiles** - concatenation of every part's `submittedFiles`, in part
   order. To preserve the unique-`name` invariant the file viewer and A8 rely on
   (`extraction.ts:262`, "a contribution's submittedFiles.name unique against
   every name already"), run `assignUnclaimedLabel` over the accumulating set of
   names so a second part's `notes.txt` becomes `notes.txt (2)`. `rawBase64` and
   `mimeType` are carried through unchanged (image parts keep their vision bytes).

4. **mergedFileCount** - the SUM of each part's own `mergedFileCount`, over the
   composite's ALLOWED part kinds. The per-part sources are: a text part contributes
   0 (`buildTextEntry`, `chatSubmissionIntake.ts:67`, opened: `mergedFileCount: 0`); a
   single file contributes 1 (`single-file-entry.ts:85` image / `:118` document, both
   opened: `mergedFileCount: 1`); a repo contributes its `fileCount`
   (`buildRepoUrlEntry`, `grading-chat-intake.ts:90`, opened:
   `mergedFileCount: repo.fileCount`). Summing these keeps the field a true count of
   constituent FILES, not of parts - which matches the ZIP precedent's "files only"
   philosophy (`utils.ts:534`), the right one to follow because, like a composite,
   neither path has a whole-student record to floor to 1.
   This design does NOT adopt the Canvas `Math.max(1, ...)` floor (`extraction.ts:538`).
   The floor exists there so a whole Canvas submission that is pure text still reports
   `1` (it is a student's entire submission, so "0 files" would read as "nothing
   submitted"). No composite PART is a floor-0 whole-student record: a text part is an
   explicit fragment the instructor added alongside others and `0` is the correct,
   honest count for it (identical to `buildTextEntry`'s own `0`). A composite therefore
   needs no floor; an all-text composite reporting `mergedFileCount: 0` is accurate.
   (Rejected alternative: count parts - that would report a 1-file + 1-text composite
   as `2` while the zip path reports a two-FILE student as `2`, conflating parts with
   files; summing each part's own count avoids that.)

5. **single-source provenance fields** (`userId`, `submissionUrl`, `gradedRepo`,
   `gradedRef`, `codeRun`, `repoReadNote`, `discussionAxes`) - LEFT UNSET/null on
   the merged entry. A composite is categorically not "a Canvas submission" nor "a
   repo submission", so no single value is coherent. Consequence to flag: a
   composite containing a GitHub repo part loses the `gradedRepo` badge; the repo's
   identity survives in the content header (rule 2). This is Fork C.

The merge does NOT run the oversize check - that is the server resolver's job on
the MERGED entry (section 4.1, Fork D), kept as the single owner of
`firstOversizedEntryReason`.

### 4.1 Pure part-classifier helper (also in the leaf)

```ts
export function extractSingleEntry(outcome: IntakeOutcome, partLabel: string):
  | { readonly ok: true; readonly entry: StudentSubmissionEntry }
  | { readonly ok: false; readonly reason: string }
```
Pure function over an already-resolved `IntakeOutcome`. The invariant is purely on
ENTRY COUNT, not on source kind: a part is admitted IFF its resolved outcome carries
exactly one entry, whatever produced it.
- `outcome.kind === "refused"` -> `{ok:false, reason: outcome.reason}`.
- `entries.length === 1` -> `{ok:true, entry}`. This ADMITS a single-submission source
  of any kind that happens to resolve to one entry - a single file, a GitHub repo
  (`buildRepoUrlEntry`, 1 entry), a single Drive file (`grading-chat-intake.ts:230-234`,
  opened: Drive single-file -> 1 entry), and would admit a single-student zip or a
  single-submission Canvas URL if one resolved to exactly 1 entry. The rule does not
  blacklist a kind; it filters on cardinality.
- `entries.length === 0` -> `{ok:false, reason: "<partLabel> had nothing to grade."}`.
- `entries.length > 1` -> `{ok:false, reason}` naming that the MULTI-entry source
  (a class zip, a multi-submission Canvas assignment/discussion) cannot be one
  student's part (Fork A). This is the one-entry invariant, and it is pure and
  oracle-testable independent of the network resolution that produced the outcome.

---

## 5. Server resolution flow

One new server action in `grading-chat-intake.ts`:

```ts
export async function prepareCompositeSubmissionAction(formData: FormData): Promise<IntakeOutcome>
```

- `requireAppOwner()` as its FIRST statement - NON-NEGOTIABLE: the action-guard
  ratchet `action-guard-coverage-github-cohort.test.ts:118-131` auto-discovers
  every `export async function` in every `"use server"` module and fails any that
  does not call `requireAppOwner()` (or sit in a reviewed permissive list). This
  test OWNS `grading-chat-intake.ts` (`:314`) and will go red without the guard.
  No count bump is needed (it discovers, not counts), but the guard call is
  mandatory same-commit.
- **Refactor** (same file): extract the per-kind resolution bodies currently
  inside `prepareChatSubmissionAction` (`:120-207`) into a module-private
  `async function resolveOnePart(kind, payload, provider): Promise<IntakeOutcome>`.
  `prepareChatSubmissionAction` becomes a thin wrapper that reads `kind`/payload
  and returns `resolveOnePart(...)` - its external behaviour and `IntakeOutcome`
  shape are byte-unchanged (oracle: the existing `grading-chat-intake.test.ts`
  cases must stay green untouched). This refactor is what lets the composite action
  and the gdrive-url scope (section 8) share ONE resolver.
- Flow of `prepareCompositeSubmissionAction`:
  1. Decode `student`, `partCount`, `provider`, and each `part.<i>.kind` +
     payload from `formData` (encoding in section 6).
  2. For each part: `const outcome = await resolveOnePart(kind, payload, provider)`;
     `const got = extractSingleEntry(outcome, partLabel)`; if `!got.ok` return
     `{kind:"refused", reason: got.reason}` (whole composite refused by name on the
     first bad part).
  3. `const merged = mergeCompositeEntries(parts.map(p => p.entry), student)`.
  4. `const oversized = firstOversizedEntryReason([merged])`; if set return
     `{kind:"refused", reason: oversized}` (Fork D: oversize is checked on the
     MERGED payload, reusing the one existing instrument and message).
  5. return `{kind:"entries", entries:[merged], pointsPossible: null}` (Fork B).

The driver's `submit` composite branch (section 7) receives exactly ONE entry and
dispatches it as ONE item -> ONE row.

---

## 6. FormData encoding (the wire shape)

The driver builds, and the action decodes, this flat FormData (FormData works in
node, so the decode is oracle-testable without a browser):
- `kind = "composite"`
- `student = <string>`
- `provider = <LlmProvider>`
- `partCount = <N>`
- for i in 0..N-1: `part.<i>.kind = "text"|"file"|"url"`, plus exactly one of
  `part.<i>.content` / `part.<i>.file` / `part.<i>.url`.

Files ride as `File` values (the existing single-file path already does this,
`useContinuousGradingRun.ts:263`). A round-trip test (encode N parts -> decode ->
same parts) is machine-checkable.

---

## 7. The composer tray interaction (owner-walk for behaviour; source canaries machine-checkable)

Design goal (owner memory "Minimize clicks"): the existing single-part path pays
ZERO extra clicks; composite assembly is opt-in.

**Coexistence rule (recommended):** the tray is empty by default. The three mode
controls keep their current immediate-submit behaviour WHEN THE TRAY IS EMPTY -
Send/Enter on text, Add on URL, pick-file - each calling the SAME existing
`onSubmitText`/`onSubmitFiles`/`onSubmitUrl` callback, byte-identical to today
(the oracle: `GradingChatPanel.structure.test.ts` canaries for the existing
handlers stay green). A new secondary control **"+ Add part"** is always present;
clicking it moves the current field's value into the tray as a `CompositePartInput`
and clears the field for the next part.

While the tray is NON-EMPTY:
- A tray list renders each accumulated part ("Text - 120 chars", "File:
  essay.docx", "URL: github.com/..."), each with a remove control.
- A single **"Student name"** text field is shown once (maps to the composite
  `student`). Optional: if blank at grade time, the driver defaults it to
  `Submission <ordinal>` (section 4 rule 1), so grading never blocks on it.
- A primary **"Grade submission (N parts)"** button calls a new panel handler
  `onSubmitComposite(student, parts)` -> `driver.submit({kind:"composite", student, parts})`.
- To avoid an accidental lone-part fire mid-assembly: while the tray is non-empty,
  the per-mode primary control (Send/Add) ALSO routes to "+ Add part" rather than
  immediate submit. So you cannot assemble two parts and accidentally grade one.

Click counts (first use; the UX seat re-walks and counts repeat use):
- Single text submission: type, Enter = 0 extra clicks vs today. PRESERVED.
- Composite (text + file + url): + Add part, pick file (auto-adds), + Add part,
  [type student], Grade = 4 primary actions. The simple path never pays for this.

Rejected alternative: an always-on tray where every submission must be Added then
Graded. Rejected because it costs the common single case one extra click - a
regression on the owner's click-cost standard.

New CSS for the tray: use `styles.ghActions`/`styles.adaptRow` (the house control-
row patterns) plus inline token styles, OR new classes in
`grading-chat.module.css` referenced SAME-COMMIT. `grading-chat.module.css` is NOT
under the exact orphan ratchet (that ratchet is `page-module-css-orphan-classes.test.ts`,
scoped to `page.module.css`), but any new class must still be referenced to avoid
dead CSS. The tray's visual detail is the Visual seat's (a later scope, serialized
after composite per section 11), not this doc's.

---

## 8. Forks, each with a recommended reading

**Fork A - how many entries a part may resolve to.** RECOMMEND: a composite part
must resolve to EXACTLY ONE entry; a part resolving to 0 or >1 refuses the WHOLE
composite by name via `extractSingleEntry` (section 4.1). The invariant is on
cardinality, not on source kind - a single file, a GitHub repo, and a single Drive
file are all 1-entry sources and are ADMITTED; a MULTI-entry source (a class `.zip`,
a multi-submission Canvas assignment/discussion) is what gets refused, by the same
one pure point. The refusal message must name the actual failure - too many students
in one source - without claiming a zip or Canvas URL is ALWAYS multi-student (a
single-student zip would be admitted). E.g.: "This source resolved to more than one
student's submission, so it can't be one student's composite part - grade it as its
own submission instead." Rejected alternative (owner's "restrict to single-submission
URLs"): there is no single-submission Canvas URL KIND in this tree
(`canvas-url.ts:8`, opened: `"discussion" | "assignment"`, both whole-class), so a
kind-based rule admits nothing Canvas and is strictly weaker than the cardinality
invariant, which admits whatever resolves to one entry (the GitHub repo, a single
file, a single Drive file) and refuses whatever does not, with no per-kind list to
maintain.

**Fork B - pointsPossible on a composite.** RECOMMEND composite
`pointsPossible: null` (section 5 step 5), the session's own rubric scale, never any
part's. This is a DELIBERATE drop, not an unreachable case. Only Canvas URLs carry a
non-null outcome-level `pointsPossible` (`grading-chat-intake.ts:194`, opened), and
although a whole-class Canvas URL is refused as >1 entry (Fork A), a Canvas
assignment with exactly ONE submission resolves to one entry and IS admitted as a
part. Its `pointsPossible` is nonetheless dropped at that point by construction:
`extractSingleEntry` returns only `entries[0]` (the `StudentSubmissionEntry`), and
`pointsPossible` lives at the `IntakeOutcome` level, not on the entry - so the scalar
is discarded the moment a Canvas part is reduced to its single entry. The composite
action then returns `pointsPossible: null` unconditionally (section 5 step 5). The
outcome is correct - a blended effort is graded on the session rubric, not on one
part's Canvas scale - and it is stated here as the intended behaviour so a future
reader does not mistake the dropped scalar for a bug or silently re-wire a part's
scale into the merge.

**Fork C - single-source provenance fields on a blended entry.** RECOMMEND leave
`userId`/`submissionUrl`/`gradedRepo`/`gradedRef`/`codeRun` unset/null (section 4
rule 5). Consequence: a composite with a repo part shows no `gradedRepo` badge;
provenance survives in the content header. Rejected alternative (carry the first
part's provenance): would mislabel the whole blended row as that one source.

**Fork D - oversize across merged parts.** RECOMMEND check
`firstOversizedEntryReason([mergedEntry])` on the MERGED entry in the server action
(section 5 step 4), reusing the one existing instrument and its message ("One
submission is too large to grade on this surface.", `grading-chat-intake.ts:99`).
A composite of individually-valid parts can exceed `ITEM_REQUEST_BYTE_BUDGET`
(3.5MB) once merged; checking per-part would admit an oversized merged payload.
Rejected alternative (per-part only): lets an oversized composite through.

**Fork E - student identity source.** RECOMMEND the explicit `student` argument,
defaulted in the DRIVER to `Submission <ordinal>` when blank (section 4 rule 1),
never derived from a part. Rejected alternative (derive from the first text part's
label / first file's stem): reintroduces the "which input was I holding" ambiguity
the ATTRIBUTION class exists to remove, and makes a fileless composite unnameable.

**Fork F - loop-top seam-only first wave?** RECOMMEND NO standalone code-only
seam wave. The seam is the TYPE CONTRACT (section 3) + the merge SEMANTICS
(section 4) authored in THIS document at the strong tier; the implementer builds
wave 1 from it. A code wave that landed only the type + pure functions would ship a
runtime export (`mergeCompositeEntries`) with no production caller until a later
wave - the exact dead-export hazard the architect brief's non-negotiable forbids
("every wave's file list must include the file that calls each new export"). So
wave 1 lands the pure functions TOGETHER WITH their runtime caller (the server
action), keeping the caller-in-wave rule satisfied. The oracle test is wave 1's
machine-check, not its only caller.
UPDATE (this revision): the type-coupling blocker in section 10 forces the DRIVER
into wave 1 as well, which strengthens this fork's conclusion - wave 1 now ships the
server action together with its PRODUCTION caller (the driver's `submit` composite
branch), not merely a test caller, so `prepareCompositeSubmissionAction` is reachable
from production code the moment it lands. The former residual worry (an action dead
until a later wave) is closed, not merely mitigated by the oracle.

---

## 9. What is machine-checkable vs owner-walk

**Machine-checkable (pure, frozen oracle - the test seat owns construction):**
- `mergeCompositeEntries`: content concat format + separator, submittedFiles union
  + name de-dup, `mergedFileCount` = summed, `student` = argument verbatim,
  provenance fields null. Oracle = a table of input resolved-entry arrays ->
  expected merged entry. Per `seats.md` Test seat, the axes (part kinds, counts,
  name collisions, image vs text parts) must come from a DIFFERENT source than the
  generator.
- `extractSingleEntry`: the 0 / 1 / >1 / refused branches, each with a mutation
  that flips it.
- FormData encode/decode round-trip (section 6).
- Oversize on a crafted merged entry just over 3.5MB (Fork D).
- Union wiring: a type-level smoke (extend the existing
  `chatSubmissionIntake.test.ts` "ChatSubmissionInput shapes" block with a
  `composite` value) + a source-text canary that `useContinuousGradingRun.submit`
  branches on `kind === "composite"` and that `prepareCompositeSubmissionAction`
  calls `requireAppOwner()` first.
- The refactor is behaviour-preserving: the existing `grading-chat-intake.test.ts`
  cases stay green with no edits (the oracle that `resolveOnePart` did not change
  `prepareChatSubmissionAction`).

**Owner-walk (browser; CANNOT be verified here - no component renders under
vitest, network blocked):**
- The tray interaction: + Add part accumulates, list + remove, name-once, Grade.
- That the single-part path is visually/behaviourally identical to today.
- The live grading producing exactly ONE row for a composite, with the merged
  content and file list visible in `GradingResults`.
- Focus behaviour and the tray's visual layout (Visual/UX/a11y seats, composite
  wave 2 and the later visual scope).

These owner-walk items are residuals with an owner and a step (section 12), not
assumptions to fill in.

---

## 10. Wave plan (dependency-ordered; each wave names its write-set and its caller)

Dependencies: the composer/panel (wave 2) call the driver, and the driver calls the
server action - but the server action's union widening and the driver's composite
branch are TYPE-COUPLED and must land together (see the blocker below), so they are
ONE wave. composer/panel (wave 2) call the driver (wave 1). Strictly sequential
within this item.

**WHY the driver is in wave 1, not a wave of its own (the type-coupling blocker).**
Widening `ChatSubmissionInput` with the 4th `composite` member immediately breaks
`tsc` on the driver's EXISTING trailing `else`. In `useContinuousGradingRun.ts`
`submit` (opened), the outer `else` (`:249`) narrows `input` to everything but
`text`; its inner `else` (`:264-267`) does `formData.set("url", input.url)` on what
is today `url` alone. Once the union gains `composite`, that inner `else` narrows to
`url | composite`, and `input.url` fails `TS2339` (`composite` has no `url`). So the
instant the union widens (wave 1's `chatSubmissionIntake.ts` edit), the driver stops
type-checking UNLESS the driver's composite handling lands in the SAME commit. The
union-widening and the driver branch are therefore inseparable; splitting them across
waves would ship a wave whose own `tsc` gate is red. This also closes Fork F's
residual concern (the driver is the server action's PRODUCTION caller, so wave 1 no
longer ships `prepareCompositeSubmissionAction` with only an oracle test calling it).

**Wave 1 - the seam + the driver: types + pure merge + server resolver + driver branch.**
Write-set:
- `src/app/components/grading-chat/chatSubmissionIntake.ts` - add `CompositePartInput`,
  the `composite` member, `mergeCompositeEntries`, `extractSingleEntry`
  (est. +70-90 lines; file 70 -> ~155).
- `src/app/actions/grading-chat-intake.ts` - extract `resolveOnePart` (re-basing onto
  the now-committed Drive branch, `:213-248`), add `prepareCompositeSubmissionAction`
  with `requireAppOwner()` first (est. +60-80 lines; file 257 -> ~325). This file is a
  runtime caller of `mergeCompositeEntries`/`extractSingleEntry`.
- `src/app/components/grading-chat/useContinuousGradingRun.ts` - add the
  `input.kind === "composite"` branch to `submit` AND fix the trailing `else`
  (`:264-267`) so the widened union type-checks: build the section-6 FormData, call
  `prepareCompositeSubmissionAction`, take `outcome.entries` (length 1) through the
  UNCHANGED admit/dispatch loop (`:290-324`) so one merged entry -> one item -> one
  row (est. +25-35 lines; file 378 -> ~410). This is the server action's PRODUCTION
  caller - it must land here, not later, both for the caller-in-wave rule and because
  omitting it leaves the union-widening commit failing `tsc`.
- `src/app/components/grading-chat/chatSubmissionIntake.test.ts` - the merge +
  extractSingleEntry oracle (test seat's notes).
- `src/app/actions/grading-chat-intake.test.ts` - composite action + round-trip +
  oversize + refactor-preservation tests.
- `src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts` -
  the composite submit produces exactly one dispatched item / one row, via the
  mocked `dispatchItem` seam the file already exposes (`:72-74`).
Caller: the driver's production caller (the composer/panel) is wave 2; the lifecycle
test drives the branch in-wave.
Gate note: `action-guard-coverage-github-cohort.test.ts` and
`wholesale-auth-mock-population.structure.test.ts` (frozen auth-mock set, `:192`)
both READ this area as source text - run them in the wave gate; if the composite
action's test needs a new auth mock, the frozen set in the wholesale test is
updated SAME-COMMIT. A wave-1 test needing comment-stripping is NOT subject to a "no
`stripComments` helper" repo rule (none exists); it should reuse `withoutLineComments`
(`GradingChatPanel.structure.test.ts:130`, opened) or define a `stripComments` copy
that satisfies the behavioural agreement probe
(`src/tools/strip-comments-agreement.structure.test.ts`, opened), which is the test
that actually governs such copies.

**Wave 2 - the composer tray + panel wiring + styles.**
Write-set:
- `src/app/components/grading-chat/ChatComposer.tsx` - tray state, "+ Add part",
  "Grade submission", student-name field; `ChatComposerProps` gains
  `onSubmitComposite` (est. +60-90 lines; file ~203 -> ~290).
- `src/app/components/grading-chat/GradingChatPanel.tsx` - `handleSubmitComposite`
  calling `driver.submit({kind:"composite", student, parts})`, passed to
  `ChatComposer` (`:238`) (est. +10-15 lines).
- `src/app/components/grading-chat/grading-chat.module.css` - tray classes if any,
  referenced same-commit.
- `src/app/components/grading-chat/GradingChatPanel.structure.test.ts` - source-text
  canaries: the composite handler is wired, the existing single-part handlers are
  unchanged, "+ Add part"/"Grade submission" controls present.
Caller: `GradingChatPanel.tsx` (wave 2) is the production caller of `onSubmitComposite`,
and (via `driver.submit({kind:"composite"})`) the production caller of the wave-1
driver branch.

Each wave is independently pushable (gates green at each) and is its own write-set
with no intra-wave parallelism needed at this size.

---

## 11. Cross-scope build ordering (re-run with the driver now in Wave 1)

**Composite's write-set changed in this revision** - `useContinuousGradingRun.ts`
moved from the old Wave 2 into Wave 1 (section 10 blocker). So the disjointness
computation is re-run against this new write-set. Composite's full write-set is now:
- Wave 1: `chatSubmissionIntake.ts`, `grading-chat-intake.ts`,
  `useContinuousGradingRun.ts`, and the three Wave-1 test files.
- Wave 2: `ChatComposer.tsx`, `GradingChatPanel.tsx`, `grading-chat.module.css`,
  `GradingChatPanel.structure.test.ts`.

**gdrive-url is no longer a concurrent scope - it has SHIPPED** (b9f27f5e, section 0).
`git show --stat b9f27f5e` touched `grading-chat-intake.ts` and `google-drive*` libs
only; it did NOT touch `ChatComposer.tsx` (203 lines unchanged). So there is nothing
to run concurrently against gdrive; composite's Wave 1 simply RE-BASES its
`resolveOnePart` extraction onto the committed Drive branch (`:213-248`, opened) -
the Drive `url` path becomes one more case inside the extracted `resolveOnePart`, and
it already satisfies Fork A (a single Drive file -> 1 entry, admitted; a Drive folder
-> refused, `:215-216`; a Drive-hosted zip -> `extractStudentEntries`, >1 refused).
This is a rebase hazard (section 13), not a concurrency bar.

**Remaining in-flight scopes and the collisions (`sort | uniq -d` on the write-sets,
the only concurrency-pass being empty, per `parallel-disjointness.md`):**

All controls citations are `docs/grading-chat-controls-scope.md:<n>`; all visual
citations are `docs/grading-chat-visual-scope.md:<n>`.

| Shared path | composite wave | controls | visual | verdict |
|---|---|---|---|---|
| `useContinuousGradingRun.ts` | W1 (driver branch) | YES - its Wave 3 harshness (`:479`) | NO | NEW collision this revision; still serialized |
| `useContinuousGradingRun.lifecycle.test.ts` | W1 | YES - adopted Wave 3 (`:483`) | NO | NEW collision this revision; still serialized |
| `ChatComposer.tsx` | W2 | YES - Wave 2 (`:471`) | YES (`:638`) | serialized (three-way) |
| `GradingChatPanel.tsx` | W2 | YES - Wave 2 (`:470`) | YES (`:636`) | serialized (three-way) |
| `grading-chat.module.css` | W2 | YES - Wave 2 (`:473`) | YES (`:635`) | serialized (three-way) |
| `GradingChatPanel.structure.test.ts` | W2 | YES - Wave 2 (`:474`) | NO - visual edits no test file (`:650-654`) | serialized (composite vs controls) |

The driver landing in composite's Wave 1 adds `useContinuousGradingRun.ts` and its
lifecycle test as NEW shared paths with the controls scope (which edits both in its
Wave 3 harshness pass). This does NOT change the ordering verdict: controls was
already serialized after composite on the composer/panel/CSS paths, and composite is
sequenced FIRST regardless, so the two were never going to run concurrently. The new
overlap only reinforces the existing serialization. visual does not touch the driver
or any test file, so the driver move creates no new collision with visual.

**Ordering (restated):**

1. **Composite FIRST (foundational).** It reshapes `ChatSubmissionInput` (section 3),
   the driver's `submit` (section 10 W1), and the composer submit model (section 7)
   that the others layer on, and it extracts `resolveOnePart` (now re-based on the
   shipped Drive branch).

2. **controls and visual AFTER composite, serialized against each other** on the
   shared composer/panel/structure-test paths (they cannot run concurrently with each
   other either - see the table). This scope does not order controls vs visual
   between themselves; it fixes only that both come after composite's reshape.
   Composite's composer (section 7, Wave 2) must ANTICIPATE controls' additions: leave
   the `ghActions`/`adaptRow` rows open for controls' clear-fields button and loading
   indicator, and make the tray's own clear compose with (not duplicate) controls'
   clear-fields. This scope does NOT redesign controls or visual; it flags only that
   the tray must not assume it owns the whole control row.

---

## 12. Residual register (owner / instrument / step - each present, or it is a deletion)

| id | residual | owner | instrument | step |
|---|---|---|---|---|
| RES-GC-CMP-LEV | the leverage claim (candidate ATTRIBUTION+SCALE, section 2) is not authored | loop-ac seat | leverage.md earned-vs-inherited check; the removal-test candidate in section 2 | Acceptance-criteria round for this item |
| RES-GC-CMP-ORACLE | the merge/extractSingleEntry oracle (axes, expected-value table, removal test) is not built | loop-test-author seat | a frozen oracle in `chatSubmissionIntake.test.ts` with axes from a source distinct from the generator | Test-seat round after wave 1 design |
| RES-GC-CMP-TRAY | the tray interaction, single-part-identical behaviour, and one-row live grading cannot be verified here (no render, network blocked) | repo owner | browser walk of the Grading chat sub-tab | owner walk after wave 2 ships |
| RES-GC-CMP-VISUAL | tray layout/spacing/colour and focus/keyboard story not designed in this doc | Visual + UX + Accessibility seats (wave 2) | source-text canaries in `GradingChatPanel.structure.test.ts` + reading claims (seats.md notes no component renders) | wave 2 design pass against the as-built composer |
| RES-GC-CMP-GUARD | a new `"use server"` export + possible new auth mock must not break the guard/frozen-set ratchets | loop-implementer (wave 1) | `action-guard-coverage-github-cohort.test.ts` (:118-131), `wholesale-auth-mock-population.structure.test.ts` (:192) | wave 1 gate - update frozen set same-commit if a new mock is added |

All residuals must be copied into `docs/BACKLOG.md` at disposal time by the
orchestrator (a residual that lives only here does not exist, per DEV_LOOP step 0).

---

## 13. Not trivially revertible

- The `ChatSubmissionInput` union change is a TYPE CONTRACT every downstream wave
  and the remaining in-flight scopes build against; reverting it after wave 2 lands
  breaks their call sites. It is additive (3 existing members unchanged), so
  reverting BEFORE downstream waves is a clean delete of the 4th member - BUT note
  the union widening and the driver's composite branch are type-coupled (section 10
  blocker: the widened union fails `tsc` on the driver's trailing `else` until that
  branch exists), so within wave 1 the two cannot be reverted independently of each
  other.
- The `resolveOnePart` extraction is a refactor of a shared function
  (`prepareChatSubmissionAction`); its oracle is that the existing
  `grading-chat-intake.test.ts` cases stay green unedited.
- No migration, no persisted-key shape change, no change to `utils.ts`/
  `extraction.ts` (the two merge precedents are reused, not edited).
