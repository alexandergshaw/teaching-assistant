# Scope: detect whether a submission zip is a whole-class bundle or a single person

Owner request, verbatim (2026-10-11): "make it to where there's a way to detect
whether a zip is for [a] class or a single person".

This is a SCOPE + ARCHITECTURE pass with embedded ACCEPTANCE CRITERIA. No
production code here. Every quantity names the command that produced it. A
`loop-checker` reads this before any build wave consumes it.

Measured against HEAD `b10e6aad` (git status at session start).

**RE-BASELINED onto the post-W2 CHAT surface.** CHAT-SUBMISSION-CONSOLIDATE W2
(`0745280a`) REMOVED the Submissions / recording / screenshots grading tabs and
unmounted `GradingTab.tsx` (the file is still on disk but nav-unreachable). The
only grading surface a user reaches is now the CHAT panel
(`GradingChatPanel.tsx`), driven by `useContinuousGradingRun.ts`. That
invalidated the two HOSTS this scope named - the badge host (was GradingTab) and
the diagnostic host (was `useWholeRunDiagnostic.ts`, GradingTab-only, now dead).
Both are re-homed here per `grading-chat-consolidation-scope.md` section 6b. The
CLASSIFIER is SHIP-confirmed and UNCHANGED: the pure leaf
`classify-submission-zip.ts`, the `GradingRun.submissionClassification` carrier,
the classifier definition (section 2.1), the 10 frozen fixtures incl. the U1
byRaw-empty pin (section 6), and forks F1-F3 all stand. Only the hosts and the
carrier WIRING onto the chat path moved.

---

## 0. Corrections to the brief, measured against the tree

Both reinforce the design rather than change it; recorded because "brief from
the tree, not the doc" is a repo rule and the checker will re-walk them.

1. **The brief says prefer deriving the signal from "the existing per-student
   grouping", NOT a new parse. Measured: the grouping discards exactly the
   per-file provenance a precise classifier needs.** `groupSubmissionsByStudent`
   (`src/lib/grade/utils.ts:439`) returns one row per distinct student key and
   keeps NONE of: the raw file path, the zip-crossing chain, or which parse rung
   (`reachedStemFallback`, `utils.ts:305`) produced the key. A
   `StudentSubmissionEntry` carries only the stripped `submittedFiles[].name`
   (citation name), never the path (`utils.ts:517-529`). So the classifier
   CANNOT be computed from the grouped `entries[]`. It IS derived from the same
   INPUTS the grouping consumes - `submissions`, `inferredLookup`, `zipParents`
   - run through the SAME exported parser the grouping calls
   (`inferStudentPrefix` / `parseSubmissionFileName`, `utils.ts:396,287`). That
   is "derived from the existing grouping" in the only sense the tree allows: it
   reuses the grouping's own key function and parser, never a second parse of the
   zip bytes. See section 2.

2. **The distinct-student COUNT is already computed - it is `entries.length`.**
   `groupSubmissionsByStudent` returns one entry per distinct identity key
   (`utils.ts:491-537`, one per `sortedKeys` member; the terminal
   disambiguation pass changes only DISPLAY, never keys, `:467-500`). So
   `entries.length` IS the distinct-student count. The classifier reproduces
   exactly this count by grouping on the same `inferStudentPrefix` key (section
   2), so `studentCount === entries.length` by construction, not by coincidence.
   The classifier adds the missing fact: WHETHER those groups rest on a
   student-separating marker or only on a bare filename stem (the A41 collapse
   case, below).

3. **In production the zip path ALWAYS infers filenames, so `inferredLookup` is
   always present.** `gradeSubmissions` (`engine.ts:570`) and the bulk-zip route
   (`grade-submission-zip/route.ts:131`) both call `ingestZipEntries(...,
   { inferFileNamesWith: provider })`. The chat-intake and incremental callers
   may or may not. So the frozen oracle MUST include `inferredLookup`-PRESENT
   fixtures (the dominant production shape), not only the bare-path shape - see
   the fixtures-must-match-emitted-shape lesson and section 6.

4. **The grading diagnostic surface already shipped.**
   `src/app/components/grading/gradingDiagnosticLog.ts` exists (120 lines,
   `wc -l`), a browser-only wrapper over the app-wide Session Diagnostic Log
   with a closed `GradingDiagnosticOperation` union (`:17-29`) and a label record
   (`:31-44`). The new owner rule ("any new feature always needs rep in the
   diagnostics") is satisfied by EXTENDING this, not building a new log. The
   browser-only contract (`session-diagnostic-log.ts:37-42`, scan at
   `session-diagnostic-log.test.ts`) means the classification - computed
   SERVER-side - must travel to a `"use client"` host and be recorded there. On
   the post-W2 chat surface the host is the chat driver's own storaged-zip
   ingest handler (`useContinuousGradingRun.ts`), which already records the other
   grading seams through `chatSeamDiagnostic.ts`
   (`recordChatSeamSettled`). See section 4.

---

## 1. Leverage trigger

This chunk builds a capability a user reaches (a classification value that is
computed and surfaced), so `DEV_LOOP.md` "The loop / Criteria" requires a
LEVERAGE CLAIM. The three-way call (claim / accept-as-plumbing / reject) is the
owner's per `leverage.md:112-123`; stated here for the AC/owner to settle, with
the build startable on the recommended reading.

**Fired trigger: feature a user reaches - leverage claim required.**

**Honest mechanism (recommended class: GUARANTEED, with one stated inference
caveat).** The app reads the uploaded archive's INTERNAL STRUCTURE - Canvas
`name_id_id_` filename conventions (`matchStudentFileConvention`, `utils.ts:87`),
per-student folders (`a44ContainerRelativeDir`, `utils.ts:202`), nested
per-student archives (`zipParents`, `extraction.ts:80`) - and computes a
class-vs-single classification. A chat window receives only pasted text: it
cannot open a zip, cannot see its folder layout or filename conventions, and
cannot count distinct students in it. This is the GUARANTEED class
(`leverage.md:44`): a property the code holds from the archive's structure. It
compounds with the existing ATTRIBUTION work (`collisionRefusal.ts`) that already
REFUSES a blended parse - this surfaces the same structural reading as a
positive, visible fact instead of only a refusal.

**The caveat, stated so the claim is not overstated (a (b)-Reduce finding for
the owner/Verify, not a gate).** It is NOT fully true that the verdict is "no
model call, independent of model output". The `roster` basis includes
`parseSubmissionFileName` step 1, `byRaw` model inference
(`utils.ts:311-320`), which takes PRIORITY over the Canvas convention. For a
no-convention zip whose names the model infers, the class/single verdict rests
in part on model output. What survives unconditionally: the STRUCTURAL fixtures
C1-C4 (Canvas convention / folders / nested archives) and U1 (bare stems) do not
depend on inference, so the removal test (AC-5, on U1) holds regardless of the
model. So the categorical claim is narrower than "no model call": the app can
inspect archive structure a chat cannot, and on structural zips the verdict is
model-independent; on a names-only zip the student IDENTITY (not the
class-vs-single shape) leans on inference. The owner/Verify decides whether to
keep the GUARANTEED claim at this reduced strength or restate it as "structural
detection, with student naming model-assisted".

**What the user does instead today, and what it costs.** Today the app grades a
zip and shows a table; the instructor infers "class vs single" by eyeballing the
row count, and a flat zip of one person's several files silently reads as several
students (A41, `docs/BACKLOG.md`) with no signal. A chat cannot do even that -
it never sees the archive.

**Removal test (buildable here, unlike LIVE-LOOP).** Because the classifier is
PURE, a real removal test exists. The advantage is the STRUCTURAL distinction, so
the removal test targets the one fixture where structure and a naive
`entries.length` disagree: a flat zip of one person's several bare-named files
(section 6, fixture U1). The real classifier returns `"unknown"` (no separating
marker); a version stripped of marker-awareness (classify by `entries.length`
alone) returns `"class"`. The assertion `classify(U1).kind === "unknown"` goes
RED when the advantage is removed. This is the removal test the test seat owns
(AC-5 / section 6). The Canvas-bundle and single-file fixtures do NOT serve as
removal tests - `entries.length` alone gets them right, so they prove
correctness, not leverage.

If the owner instead reads this as observability plumbing, record that as the
fired trigger and drop the claim - the feature ships either way
(`leverage.md:186-193`).

---

## 2. THE SIGNAL AND THE CLASSIFIER (the load-bearing decision)

### 2.1 Definition, precise

Let the inputs be the three maps `ingestZipEntries` already holds after
extraction: `submissions: Record<fullPath, text>`, optional `inferredLookup`,
and `zipParents: Record<fullPath, string[]>` (outermost first;
absent/empty = crossed no zip boundary, `extraction.ts:72-80,157`).

For each file path `p` in `submissions`, derive, using the SAME exported parser
the grouping uses:

```
parsed = parseSubmissionFileName(p, inferredLookup, zipParents[p])   // utils.ts:287
key    = inferStudentPrefix(p, inferredLookup, zipParents[p]).key    // utils.ts:396  (grouping's own key)
chain  = zipParents[p] ?? []
relDir = a44ContainerRelativeDir(p, chain)                           // utils.ts:202 (exported)

basis(p) =
  "roster"    if parsed.reachedStemFallback === false      // step 1 inference, or step 2/3 Canvas convention
  "structure" if reachedStemFallback === true AND (chain.length > 0 OR relDir !== "")  // step 5 nested zip, or step 6 folder
  "stem"      otherwise                                     // step 6 flat root filename - a BARE stem, the A41 case
```

Group the paths by `key` (reproducing `groupSubmissionsByStudent`'s grouping
exactly, since it uses the same `inferStudentPrefix` key). For each group, its
basis is the STRONGEST of its files (`roster` > `structure` > `stem`). Then:

```
studentCount       = number of distinct keys                 // === entries.length (section 0 note 2)
markerStudentCount = number of groups whose basis is "roster" OR "structure"

kind =
  "unknown"  if studentCount === 0                           // nothing gradable
  "class"    if markerStudentCount >= 2                      // >=2 students each with a separating marker
  "single"   if studentCount === 1                           // exactly one student group
  "unknown"  otherwise  (studentCount >= 2, markerStudentCount < 2)
             // several groups that exist only because bare files at the root each
             // stemmed to their own key - cannot tell one person's flat zip from a
             // markerless loose bundle. This is the defined AMBIGUOUS FALLBACK.
```

**Why `markerStudentCount >= 2` and not `entries.length >= 2` for "class".** A
single person's flat zip of `main.py` + `report.docx` at the root splits into
TWO bare-stem groups (`parseSubmissionFileName` step 6 with empty `relDir`,
`utils.ts:379-386`). Classifying that as "class" would be the A41 false signal
in reverse. "Class" requires a positive student-SEPARATING marker (Canvas
convention OR folder/nested structure) on at least two students. The folder case
IS "class": per-student folders reach step 6 with a non-empty `relDir`
(`utils.ts:202-213`), which `basis` scores as `"structure"`, so
`AlvarezMaria/essay.docx` + `ChenWei/essay.docx` -> 2 structure groups -> class.

**Why `studentCount === 1` is "single" regardless of basis.** One student group
is one person, whether identified by a Canvas marker, inference, a folder, or a
bare stem. A one-file flat zip, and a one-student Canvas bundle with several
files sharing one `name_id_id_` prefix, both resolve to one key.

### 2.2 The classification value

A new pure leaf `src/lib/grade/classify-submission-zip.ts` exports the function
and the result shape. The TYPE lives in `src/lib/grade/types.ts` (next to
`InferredFileNameLookup`), NOT in the leaf, so `GradingRun` (also in `types.ts`)
can carry it WITHOUT a types <-> leaf import cycle (the leaf imports the type
from `types.ts`; `types.ts` imports nothing from the leaf). This is the
split-constants-into-the-leaf cycle hazard, headed off by construction.

```ts
// in src/lib/grade/types.ts
export type SubmissionZipKind = "class" | "single" | "unknown";
export interface SubmissionZipClassification {
  readonly kind: SubmissionZipKind;
  readonly studentCount: number;        // distinct student groups (=== entries.length)
  readonly markerStudentCount: number;  // groups with a roster/structure marker
  readonly signal: "canvas-convention" | "folders" | "nested-archives" | "single-group" | "ambiguous" | "empty";
}
```

`signal` is a convenience describing WHY, for the badge and the diagnostic. Its
value is the dominant marker basis among the deciding groups (`canvas-convention`
when the markers are roster/convention, `folders` / `nested-archives` for
structure, `single-group` for the single case, `ambiguous` for the multi-stem
fallback, `empty` for zero). The MACHINE-PINNED facts are `kind`, `studentCount`
and `markerStudentCount`; `signal` is pinned too but is a FLOOR the test seat may
refine.

```ts
// in src/lib/grade/classify-submission-zip.ts  (PURE; no Buffer, no fetch)
export function classifySubmissionZip(
  submissions: Record<string, string>,
  inferredLookup?: InferredFileNameLookup,
  zipParents?: Record<string, string[]>,
): SubmissionZipClassification
```

Estimated size: ~90-130 lines (`@(Get-Content).Count` at build). Pure, node-env
testable - the frozen oracle (section 6) is the whole point.

### 2.3 Where it is computed

Inside `ingestZipEntries` (`extraction.ts:225`), after `groupSubmissionsByStudent`
and using the SAME `submissions`, `inferredLookup`, `zipParents` already in scope
(`extraction.ts:265-268`). Add the classification to the return object:

```
return { entries, attemptedSupportedFiles, failedSupportedFiles, classification };
```

This is additive - every existing caller (`engine.ts`, `grade-submission-zip`
route, `grading-chat-intake.ts`, `grading-incremental.ts`, `extractStudentEntries`)
ignores the new field until wired. `extraction.ts` is THE CALLER of the new
export, satisfying the "a wave includes the caller of each new export" rule.

`ingestZipEntries` is the SINGLE compute point, and it is reached by BOTH the
chat zip path (the `grade-submission-zip` route calls it, `route.ts:131`) and
the direct engine path (`gradeSubmissions`, `engine.ts:570`). Post-W2 the LIVE
UI path is the chat route (section 3 carries the result over NDJSON); the engine
carrier is kept per the SHIP-confirmed scope but is not how the chat UI receives
the value.

**The zero-gradable early return is a stated edge, on both paths.**
- Engine path: `gradeSubmissions` returns BEFORE `gradeStudentEntries` when
  `studentSubmissions.length === 0` - THROWS when files were found but unreadable
  (`engine.ts:582-584`), else returns an empty `GradingRun` (`:587-592`). Keep
  `engine.ts` setting `submissionClassification` on the empty-results return
  branch too (one line), so a direct caller sees it.
- Chat path: an empty zip makes `ingestStoragedZip` complete with zero entries,
  and the driver REFUSES before building a run (`useContinuousGradingRun.ts:328-330`,
  "No student submissions were found"), so no badge renders - the refusal copy
  is the surface, not a badge. Stated so a checker is not surprised by a silent
  empty case on the chat path.

---

## 3. WHERE IT SURFACES (the surface is a layer - name it)

The owner said "a way to DETECT", so the classification must be COMPUTED and
VISIBLE. The surface is a layer; it is named here, on the post-W2 CHAT surface.

**SEMANTIC FRAME: in the chat a zip is one submission among a growing stream, so
class-vs-single is PER-INGEST, not per-whole-run.** The chat session's `run`
(`driver.run`) grows as submissions arrive; a single storaged-zip submit is one
ingest within it. The classification describes THAT zip ingest. The badge
therefore reflects the MOST RECENT storaged-zip ingest in the session (a
text-only / Canvas-only session has none, and the badge does not render). This
is framed as "this upload is a class bundle of N" / "a single submission", not
as a property of the whole session.

### 3.1 THE b-CARRIER WIRING (the load-bearing new invention)

The classification does NOT reach `driver.run` for free. `driver.run` is built
by `buildIncrementalRun` (`useContinuousGradingRun.ts:194-203`,
`incrementalRunPlan.ts:313`), whose inputs
(`{header, speedGraderUrl, totalTicketCount, arrived, phase, tier2}`) carry NO
classification. And the chat ingests a zip via the NDJSON route
(`ingestStoragedZip`, `useContinuousGradingRun.ts:163,314`), NOT via a direct
`ingestZipEntries` return the client can read. So the value must be carried over
FOUR explicit hops:

1. **Server computes it (Wave 1, unchanged).** `ingestZipEntries` returns
   `classification` (section 2.3). The chat's zip route
   (`grade-submission-zip/route.ts:131,147-148`) already destructures
   `outcome.value.value` and builds the NDJSON via
   `buildIngestLines(entries, failedSupportedFiles)`.
2. **Stream it on the NDJSON `done` sentinel.** In
   `src/lib/grade/ndjson-ingest-parser.ts`, add
   `classification?: SubmissionZipClassification` to `IngestLedger`
   (`:17-22`) - the sentinel already carries `studentsFound` / `studentsEmitted`
   / `skipped` / `failedSupportedFiles`, so this is one more additive field on
   the `done` line. APPEND `classification` LAST on `buildIngestLines` -
   `buildIngestLines(entries, failedSupportedFiles, budget = ITEM_REQUEST_BYTE_BUDGET,
   classification?)` - NOT as arg 3: inserting it before `budget` would shove the
   positional budget to arg 4 and break all six existing callers that pass `100`
   as arg 3 (`ndjson-ingest-parser.test.ts:38,50,69,85,179,183`). With it last,
   those callers are unperturbed, and `route.ts` calls
   `buildIngestLines(entries, failedSupportedFiles, undefined,
   outcome.value.value.classification)` (`undefined` budget keeps the default).
   The never-throw client parser reads it
   off the sentinel (a new validator, mirroring `skipList`/`stringList`, that
   accepts only a well-formed `{kind, studentCount, markerStudentCount, signal}`
   and yields `undefined` otherwise) onto `IngestOutcome.ledger.classification`
   (`:70-72, 186-199`). A missing/old-server sentinel yields `undefined` -
   graceful, no crash.
3. **Driver captures it.** In `useContinuousGradingRun.ts`'s storaged-zip submit
   branch (`:307-331`), after `ingest.kind === "complete"`, store
   `ingest.ledger.classification` in a new `classificationRef`
   (`useRef<SubmissionZipClassification | null>(null)`). `reset()` clears it
   (`:510-534`). Per-ingest semantic: the latest zip ingest overwrites it; a
   non-zip submit leaves it untouched.
4. **Stamp it onto the run.** Add `submissionClassification?:
   SubmissionZipClassification` to `BuildIncrementalRunParams`
   (`incrementalRunPlan.ts:~300-311`) and set it on the returned run (`:318-328`,
   additive to the existing `return`). `rebuildRun` (`useContinuousGradingRun.ts:190-204`)
   passes `submissionClassification: classificationRef.current ?? undefined`. So
   every rebuild stamps `driver.run.submissionClassification` with the latest zip
   ingest's classification.

This is the invention a checker should attack hardest: the value crosses a
process boundary (server -> NDJSON -> client) and a build boundary
(`ingestZipEntries` return -> `buildIncrementalRun` input), and NEITHER
`buildIncrementalRun` nor `driver.run` sees `ingestZipEntries` directly. Each hop
is named with its file:line and has a graceful `undefined` fallback.

**SECOND chat zip path (do not miss it): the small-zip `file` kind.** A class
zip small enough for the request body is dropped as a chat `file` submission, not
a storaged-zip (`classifyGradingUpload` returns `"zip"`,
`single-file-entry.ts:98,108`, so this path is reachable). It flows `submit`
(`useContinuousGradingRun.ts:371-404`, `input.kind === "file"`) ->
`prepareChatSubmissionAction` -> `resolveOnePart`'s `uploadKind === "zip"` branch
(`grading-chat-intake.ts:200-204`) -> `IntakeOutcome` (`chatSubmissionIntake.ts:54-56`).

**THE WIRING, corrected (round-1 rested on a FALSE "already reads" claim).**
`resolveOnePart`'s zip branch at `grading-chat-intake.ts:203` calls
`extractStudentEntries(...)`, NOT `ingestZipEntries`, and `extractStudentEntries`
(`extraction.ts:209-215`) is `const { entries } = await ingestZipEntries(...);
return entries;` - it DISCARDS the classification at `:213` and returns a bare
`StudentSubmissionEntry[]`. So there is nothing for `resolveOnePart` to stamp. The
fix (the MORE LOCALIZED of the two options, and the one taken):

- **Change `resolveOnePart`'s zip branch (`grading-chat-intake.ts:200-204`) to
  call `ingestZipEntries(await file.arrayBuffer(), { inferFileNamesWith: provider })`
  DIRECTLY and read BOTH `{ entries, classification }`** (instead of
  `extractStudentEntries`, which throws it away). `extractStudentEntries` is a
  thin wrapper that adds nothing over `ingestZipEntries` beyond dropping the
  classification, so the direct call loses no behaviour and leaves
  `extractStudentEntries` untouched for its OTHER callers. The A44 collision
  refusal still throws from inside `ingestZipEntries` (`extraction.ts:253-256`),
  caught by the existing `try/catch` at `grading-chat-intake.ts:208` exactly as
  before (the inline comment at `:201-202` naming `extractStudentEntries` as the
  thrower is updated to name `ingestZipEntries`, the real source).
- **Stamp it onto `IntakeOutcome`:** add
  `classification?: SubmissionZipClassification` to the `"entries"` branch
  (`chatSubmissionIntake.ts:54-56`); `resolveOnePart` returns
  `{ kind: "entries", entries, pointsPossible: null, classification }`.
- **Driver captures it into the SAME `classificationRef`:** the file branch of
  `submit` (`useContinuousGradingRun.ts:402`, `entries = outcome.entries`) also
  reads `outcome.classification` into `classificationRef` (the same ref the
  storaged-zip path sets).

Traced by file:line: `grading-chat-intake.ts:200-204` (ingestZipEntries + read
classification) -> `chatSubmissionIntake.ts:54-56` (`IntakeOutcome.classification`
on the entries branch) -> `useContinuousGradingRun.ts:402` (file branch, into
`classificationRef`). All three sites verified to exist at HEAD. So both chat zip
sizes feed one ref -> one `buildIncrementalRun` stamp -> one badge. A text /
single-non-zip-file / URL submission leaves `classification` absent on its
`IntakeOutcome`, so the ref is untouched (per-ingest semantic holds). Without
this fix a small class zip in chat shows NO badge while every NDJSON-driving gate
stays green - the exact gap this revision closes.

### 3.2 THE BADGE HOST

- **Rendered as a badge/line** by a NEW presentational leaf
  `src/app/components/grading/SubmissionClassificationBadge.tsx` reading
  `run.submissionClassification`: e.g. "Class bundle - 23 students",
  "Single submission", or "Could not determine (several loose files)". Copy in
  the app's voice, no emojis. Self-contained pure render of one run value.
- **MOUNT IN `GradingChatPanel.tsx`'s stream block (`GradingChatPanel.tsx:515-517`),
  beside the `RubricProvenance` / `GeneratedRubricCard` / `GradingResults`
  that already render on `driver.run`** when `hasRows && driver.run`. The badge
  reads `driver.run.submissionClassification`. This is the only live grading
  render surface after W2, and `driver.run` is already in scope there.
- **CEILING: `GradingChatPanel.tsx` is 563 lines (`wc -l`), well under the
  repo-wide 1000, with NO special ratchet** (the RES-GRAD-5 ratchet applied only
  to `GradingTab.tsx`, which W2 unmounted and this scope no longer touches).
  So the GradingNotesCard extraction and the `GRADING_TAB_RATCHET` re-pin named
  in the pre-W2 draft are MOOT and DROPPED. Re-measure
  `@(Get-Content src/app/components/grading-chat/GradingChatPanel.tsx).Count` at
  build; a ~3-line import + mount leaves ample headroom.
- **Reading claim, by the no-render ceiling.** No component renders under vitest
  (`this-repo.md:134`), so the badge's RENDERED appearance is owner-walk, not
  machine-checkable. The testable obligations are the pure classifier (section
  6), the NDJSON carrier round-trip (section 6), `buildIncrementalRun` stamping
  the field (section 6), and the diagnostic leaf (section 4). The badge is a thin
  reader of a value those pin.

---

## 4. THE DIAGNOSTIC (owner rule 2026-10-11: every new feature needs rep)

The classification is recorded into the app-wide Session Diagnostic Log through
the existing grading wrapper, so a downloaded session log shows it. Computed
server-side, recorded client-side (browser-only contract, section 0 note 4).

**Recommended encoding (startable now; fork F2 for the owner):**

- **KIND -> operation (wrapper-local, no core change).** Add three operations to
  the closed `GradingDiagnosticOperation` union (`gradingDiagnosticLog.ts:17-29`)
  and its label record (`:31-44`):
  | operation | label |
  |---|---|
  | `classify_submission_class` | "Classified: class bundle" |
  | `classify_submission_single` | "Classified: single submission" |
  | `classify_submission_unknown` | "Classification: undetermined" |
  Three stable (operation, label) pairs; the kind rides in the operation, which
  the core entry already carries as a free string (`session-diagnostic-log.ts:132`).
- **COUNT -> one new optional numeric field on the core entry**, mirroring the
  `durationMs` precedent EXACTLY (`session-diagnostic-log.ts` added `durationMs`
  as an optional, conditionally-stored number). Add
  `classificationStudentCount?: number`. Blast radius, by direct analogy to
  `durationMs` (each with the test that goes red if missed):
  1. `SessionDiagnosticEntry` (`:128`): add the optional field.
  2. `RecordSessionDiagnosticArgs` (`:203`): add it.
  3. `recordSessionDiagnosticEntry` (`:223-234`): copy CONDITIONALLY
     (`...(args.classificationStudentCount !== undefined ? { ... } : {})`), never
     as an explicit `undefined` key (keeps the round-trip `toEqual` honest).
  4. `ENTRY_CSV_HEADER` (`:381`) + the row (`:423-435`): add a "Students" column.
  5. JSON (`:446-464`): `...log` spreads it automatically; a test pins it.
  6. Round-trip `parseOneEntry` (`:496-523`): read it like `durationMs`
     (`typeof === "number" && Number.isFinite` -> keep; else omit).
  7. On-screen line (`SessionLogSection.tsx`): optional, reading claim.
  This field is a CLOSED-ENUM-adjacent integer with NO student data and NOTHING
  branches on it - it is not a free-text channel (the trap the system brief
  warns of); the guard checks a number, not a name.
- **No `error`-field smuggling.** The classification NEVER rides in `error`
  (reserved for scrubbed failure text, `:143,232`). The three operations are
  recorded with `outcome: "success"` (classification does not "fail"; an
  unreadable zip is a separate, already-recorded grading failure).

**Pure decision leaf (no render needed to test), WITH the start-time guard.** Add
to `gradingDiagnosticLog.ts`, mirroring the chat seam's own
`decideChatSeamDiagnostic` (`chatSeamDiagnostic.ts:51-63`) and
`decideWholeRunDiagnostic` (`:89-100`) - the mirror MUST include the
`startedAtMs === null` guard, not only the classification check:

```ts
export function decideClassifyDiagnostic(args: {
  startedAtMs: number | null;                      // a chatSeamNowMs() capture before the ingest
  settledAtMs: number;                             // chatSeamNowMs() at the record point
  classification: SubmissionZipClassification | undefined;
}): { operation: GradingDiagnosticOperation; studentCount: number; durationMs: number } | null;
// null when startedAtMs === null      (no ingest in flight -> no record)
// null when classification is undefined (no zip classification streamed)
// else { operation: `classify_submission_${classification.kind}`,
//        studentCount: classification.studentCount,
//        durationMs: Math.max(0, Math.round(settledAtMs - startedAtMs)) }
```

**Duration: the zip ingest/prepare elapsed time.** `recordGradingDiagnosticEntry`
requires a NON-optional `durationMs` (`gradingDiagnosticLog.ts:51`), and
`decideClassifyDiagnostic` supplies it the same way
`decideWholeRunDiagnostic`/`decideChatSeamDiagnostic` do - `settledAtMs -
startedAtMs`, where `startedAtMs` is a `chatSeamNowMs()` capture taken just before
the ingest (storaged-zip) or the `prepareChatSubmissionAction` (file path) and
`settledAtMs` is `chatSeamNowMs()` at the record point. So the classify entry
carries the real ingest latency, which is itself useful in the downloaded log.
`recordClassifySettled` captures `settledAtMs` and passes it to the leaf.

**Host = the chat driver's zip ingest branches (`useContinuousGradingRun.ts`),
recorded ONCE PER INGEST - at BOTH zip paths (section 3.1).** This replaces the
dead `useWholeRunDiagnostic.ts` host (GradingTab-only). The chat path is SIMPLER
than the old whole-run settle effect: `submit` is an imperative async event
handler called once per submission, NOT a render effect keyed on `[pending,
state]`, so there is no render-loop over-record risk. Record wherever a zip
classification is captured into `classificationRef`:
- storaged-zip branch (`:307-331`): capture `classifyStartedAtMs =
  chatSeamNowMs()` before `await ingestZip(...)` (`:314`); after
  `ingest.kind === "complete"`, call `recordClassifySettled({ startedAtMs:
  classifyStartedAtMs, classification: ingest.ledger.classification, at })`.
- file-kind zip branch (`:371-404`): capture the start before
  `prepareChatSubmissionAction`; after the `"entries"` outcome, call
  `recordClassifySettled({ ..., classification: outcome.classification, at })`.
Because `submit` runs once per submission, each records exactly once per ingest;
the `startedAtMs` guard is always satisfied at the record point, and the
`classification === undefined` branch (a non-zip submission, a refused ingest, or
an old-server sentinel) means no spurious record on the non-zip submits.

`recordClassifySettled` and `decideClassifyDiagnostic` live in
`gradingDiagnosticLog.ts` (the surviving leaf home), NOT in `chatSeamDiagnostic.ts`:
`ChatSeamDecision` carries a `failureClass`, not a `studentCount`, and the
classify operation is a distinct `GradingDiagnosticOperation`, so it records
through `recordGradingDiagnosticEntry` with the new count field, as its own thin
recorder beside the chat-seam one. No `classificationFromRun` narrower is needed
(the value comes straight off `ingest.ledger.classification`, already typed).
These two functions are the testable obligations; that the driver calls the
recorder on the real ingest-complete edge is the reading claim (no render under
vitest, but `submit` IS exercised by the hook's no-render lifecycle harness,
`useContinuousGradingRun.ts:27-29,80-89`, so the recorder call CAN be driven with
a mocked `ingestZip` returning a classification - a real machine-checkable
wiring test, stronger than a reading claim).

**No exact-set/size canary to bump (stated so the obligation is not vacuous).**
`gradingDiagnosticLog.test.ts` pins only `.grade_whole_run` on the label record,
NOT an exact-set or size assertion over `GRADING_DIAGNOSTIC_OPERATION_LABELS` or
the `GradingDiagnosticOperation` union. So adding the three `classify_submission_*`
operations needs NO canary bump; the coherence gate is `tsc` over
`Readonly<Record<GradingDiagnosticOperation, string>>` (`gradingDiagnosticLog.ts:31`),
which fails until each new union member has a label. State this in the test
notes rather than scanning for a canary that does not exist.

**Coverage honesty.** The `"grading"` surface and its `COVERAGE_BY_SURFACE` row
already exist (`session-diagnostic-log.ts:73,97-99`). Adding operations to an
already-covered surface needs NO coverage-row or NOT_COVERED change
(`grading-diagnostics-coverage-scope.md` section 5: "a build wave may add an
operation to the already-covered surface without any coverage-honesty change").
The coverage row wording may optionally gain "and classifying an uploaded zip as
a class bundle or a single submission"; not required for honesty.

---

## 5. WHAT MUST NOT CHANGE

- **Grading behaviour, latency, and the grouped entries.** The classifier is a
  SECOND pure pass over the same maps; it never mutates `submissions`,
  `zipParents`, `entries`, or any grade. `groupSubmissionsByStudent`,
  `parseSubmissionFileName`, `collisionRefusal` are READ, never edited - this
  item adds no rung to the parser and changes no key (the A44/A45 invariants and
  their 28+ pinned tests stay untouched).
- **No new byte parse.** The classifier reuses the exported `inferStudentPrefix`
  / `parseSubmissionFileName` / `a44ContainerRelativeDir`; it does not re-open
  the zip or re-implement `matchStudentFileConvention` (not exported, and
  re-implementing it would drift).
- **Browser-only diagnostic contract.** No server file (`src/app/api/**`,
  `src/app/actions/**`, any `"use server"`) imports `gradingDiagnosticLog` or
  `session-diagnostic-log`. The classification reaches the client over the NDJSON
  ingest STREAM (section 3.1) - carried as data on the `done` sentinel, NOT by a
  server module importing the diagnostic - and is recorded from the `"use client"`
  chat driver only. `ndjson-ingest-parser.ts` stays a plain `.ts` leaf with no
  React and no diagnostic import (it is imported by both the route and the
  client, `:1-10`).
- **No student personal data in any diagnostic field.** The three operations,
  their labels, and the integer count carry no name or submission text. The
  `SubmissionZipClassification` streamed on the NDJSON sentinel is
  `{kind, studentCount, markerStudentCount, signal}` - counts and enums only, no
  student name.
- **The size ceilings.** `GradingChatPanel.tsx` (563, the badge host) is well
  under the repo-wide 1000 and has NO special ratchet. The RES-GRAD-5
  `GRADING_TAB_RATCHET` is irrelevant here - W2 unmounted `GradingTab.tsx` and
  this scope does not touch it, so the pre-W2 extraction/re-pin plan is dropped.
  Do not add inline markup to `GradingResults.tsx` (999/1000). Re-measure every
  touched file with `@(Get-Content).Count` at build.
- **No emojis / non-ASCII** anywhere (`src/lib/no-emojis.test.ts`).

---

## 6. THE FROZEN ORACLE (test seat owns the content; this is the spec)

A pure test over zip-entry fixtures that MATCH THE SHAPE `extractSubmissions`
emits: `submissions` keyed by full archive path, `zipParents` keyed by the same
path (outermost first, ABSENT for a top-level file - `extraction.ts:157`),
`inferredLookup` optional. **Axes must come from a different source than the
generator** (`seats.md`, Test seat): the fixture descriptors (path + intended
basis) are one source; the expected `{kind, studentCount, markerStudentCount}`
table is hand-specified independently, NEVER by calling `classifySubmissionZip`.

**Every fixture is run BOTH with and without `inferredLookup`** where meaningful,
because production always passes it (section 0 note 3). An `inferredLookup`
fixture is a real `{ byRaw: Map<rawPath, {studentDisplay, citationFileName}> }`
(`types.ts:497`).

| id | fixture (submissions keys; zipParents) | expected kind | count | marker |
|---|---|---|---|---|
| C1 | `alvarezmaria_12_34_essay.docx`, `chenwei_56_78_essay.docx` (root; no zipParents) | class | 2 | 2 |
| C2 | `AlvarezMaria/essay.docx`, `ChenWei/report.docx` (root folders; no zipParents) | class | 2 | 2 (structure) |
| C3 | nested per-student zips: files with `zipParents:["alvarezmaria_1_2_s.zip"]` and `["chenwei_3_4_s.zip"]` | class | 2 | 2 |
| C4 | 5 foldered students, one also with a Canvas-named file | class | 5 | 5 |
| S1 | `essay.docx` (one root file) | single | 1 | 0 |
| S2 | one student, two files sharing `jordanlee_9_9_` prefix | single | 1 | 1 |
| S3 | `AlvarezMaria/essay.docx`, `AlvarezMaria/refs.docx` (one folder, two files) | single | 1 | 1 (structure) |
| U1 | `main.py`, `report.docx`, `README.md` (one person, flat, bare stems) | unknown | 3 | 0 |
| U2 | `{}` (empty / nothing gradable) | unknown | 0 | 0 |
| U3 | one Canvas-named student + two loose bare-stem root files | unknown | 3 | 1 |

U1 is the REMOVAL-TEST fixture (section 1): real -> `unknown`; marker-awareness
stripped (classify by `entries.length` alone) -> `class`. Pin
`classify(U1).kind === "unknown"` as the leverage removal assertion.

**U1 byRaw-EMPTY constraint (protects the removal instrument).** U1's
`inferredLookup`-present variant MUST keep `byRaw` EMPTY for the three bare
files (`main.py`, `report.docx`, `README.md`). This matches production:
`inferFileNameConvention` yields no inference for identity-less generic names,
and `parseSubmissionFileName` step 1 is reached only on a `byRaw` HIT
(`rubric.ts:197` skips a file whose inferred `studentDisplay`/`citationFileName`
is empty). A test author who populates `byRaw` for U1 with three distinct
student names makes every file `basis: "roster"`, flips U1 to `class`, and
SILENTLY defeats AC-5. State this as a hard fixture constraint, not a default:
U1's `byRaw` is empty in both variants, and the only legitimate inference entry
for U1 is none.

**Reference-implementation obligation (seat practice 1, `seats.md:440`).** Build
the classifier in an isolated tree and get all fixtures green before hand-off,
proving the table is satisfiable.

**Sabotage (proves the oracle can fail), each with the mutation and the fixture
that goes red:**
- Flip `markerStudentCount >= 2` to `>= 1` -> U3 turns `class` (was `unknown`);
  assertion on U3 goes red.
- Treat `stem` basis as a marker (count all groups) -> U1 turns `class`; the
  removal assertion goes red.
- Drop the `studentCount === 0 -> unknown` guard -> U2 turns `single` (count 0
  falls through); U2 goes red.
- Change grouping key to the raw path (not `inferStudentPrefix`) -> S2/S3 split
  into 2 groups, turning `single` into `class`/`unknown`; S2 goes red.

**NDJSON carrier round-trip (the b-carrier, section 3.1) - node-testable, no
render:**
- `buildIngestLines(entries, failed, classification)` puts `classification` on
  the `done` sentinel line; `encodeIngestLine` / parse round-trips it; the client
  parser in `ingestStoragedZip` surfaces it on `IngestOutcome.ledger.classification`.
  Drive `ingestStoragedZip` with an injected `IngestFetch` (`:74-83,162`) that
  streams a scripted NDJSON body - the file's existing no-network test seam.
- A `done` sentinel WITHOUT a classification (old server) -> `ledger.classification`
  is `undefined` (graceful). A malformed classification object on the sentinel ->
  `undefined`, never a crash and never a refusal (mirrors `skipList`/`stringList`).
- `buildIncrementalRun({ ..., submissionClassification })` sets
  `run.submissionClassification`; omitting it leaves the field absent. One
  assertion each.

**Diagnostic leaf oracle (no render), proving the start-time guard:**
- `decideClassifyDiagnostic({ startedAtMs: null, settledAtMs: 9, classification: {kind:"class",studentCount:23,...} })`
  -> `null` (no ingest in flight; goes red if a mutant drops the
  `startedAtMs === null` branch).
- `decideClassifyDiagnostic({ startedAtMs: 5, settledAtMs: 9, classification: undefined })`
  -> `null` (no classification streamed).
- `decideClassifyDiagnostic({ startedAtMs: 5, settledAtMs: 9, classification: {kind:"class",studentCount:23,...} })`
  -> `{operation:"classify_submission_class", studentCount:23, durationMs:4}`; one
  per kind, with `durationMs = settledAtMs - startedAtMs`.

**Driver wiring test (machine-checkable via the no-render lifecycle harness).**
Drive `useContinuousGradingRun` with an injected `ingestZip`
(`UseContinuousGradingRunParams.ingestZip`, `:85-89`) that returns
`{kind:"complete", ledger:{..., classification:{kind:"class",studentCount:3,...}}}`;
assert (a) `driver.run.submissionClassification` carries it after the submit, and
(b) exactly ONE `classify_submission_class` entry is recorded (not one per
rebuild). This proves the carrier AND the once-per-ingest recording without a
render - stronger than a reading claim.

Plus a `session-diagnostic-log` round-trip: an entry with
`classificationStudentCount` survives `formatSessionDiagnosticLogJson` ->
`JSON.parse` -> `parseSessionDiagnosticLogEntries` and appears in the CSV
"Students" column; an entry WITHOUT it round-trips with no spurious key (pins the
conditional store).

No cross-`*.test.ts` helper imports (`no-cross-test-file-imports` lesson);
duplicate fixtures if shared.

---

## 7. ACCEPTANCE CRITERIA

Each pass condition names the OBJECT compared, the INSTRUMENT producing each
quantity, and the DIRECTION of failure.

- **AC-1 (classifier definition is exact and derived).** `classifySubmissionZip`
  (`src/lib/grade/classify-submission-zip.ts`) returns `kind`/`studentCount`/
  `markerStudentCount` per section 2.1, computed by reusing `inferStudentPrefix`,
  `parseSubmissionFileName` and `a44ContainerRelativeDir` from `utils.ts` - no
  new zip parse, no re-implemented convention regex.
  - Object: the function's return for each section-6 fixture. Instrument:
    `classify-submission-zip.test.ts` (node). FAIL: any fixture's returned
    `{kind, studentCount, markerStudentCount}` differs from the hand-specified
    table.

- **AC-2 (class/single/unknown handled, ambiguous defined).** `class` requires
  `markerStudentCount >= 2`; `single` is `studentCount === 1`; `unknown` is the
  explicit fallback for `studentCount === 0` AND for `studentCount >= 2` with
  `markerStudentCount < 2`.
  - Object: fixtures C* (class), S* (single), U* (unknown). Instrument: the
    oracle. FAIL: C* not `class`, S* not `single`, or U* not `unknown`.

- **AC-3 (count agrees with grouping).** For every fixture,
  `classify(...).studentCount === groupSubmissionsByStudent(...).length`.
  - Object: the two counts over the same inputs. Instrument: a cross-check
    assertion in the oracle calling both. FAIL: the counts differ on any fixture.

- **AC-4 (computed in ingest, carried to the chat run on BOTH zip paths,
  visible).** `ingestZipEntries` returns `classification`; it reaches
  `classificationRef` via the storaged-zip NDJSON path (route `done` sentinel ->
  `ingestStoragedZip` -> `IngestOutcome.ledger.classification`) AND the small-zip
  `file` path (`resolveOnePart` -> `IntakeOutcome.classification`); the chat
  driver stamps the ref onto `buildIncrementalRun`'s output so
  `driver.run.submissionClassification` is populated; `GradingChatPanel` mounts
  `SubmissionClassificationBadge` reading it (section 3.1, 3.2).
  - Object (machine): the NDJSON round-trip and the driver's stamped
    `driver.run.submissionClassification`. Instrument: `ndjson-ingest-parser`
    tests (sentinel carries it; old-server/malformed -> `undefined`),
    `incrementalRunPlan` test (field stamped), and the `useContinuousGradingRun`
    lifecycle test with an injected `ingestZip` (section 6). FAIL: the field is
    not carried across any hop, or a missing/malformed sentinel crashes rather
    than yielding `undefined`.
  - Object (reading claim): the badge renders the kind + count in the chat
    stream. Instrument: owner/browser walk (no render under vitest). FAIL: badge
    absent or wrong - recorded as residual RES-ZIP-CLASS-WALK, not a machine gate.

- **AC-5 (leverage removal test).** `classify(U1).kind === "unknown"`, and the
  same inputs under an `entries.length`-only classifier would be `"class"`.
  - Object: U1's `kind` under the real classifier vs the stripped one.
    Instrument: the oracle's removal assertion + the section-6 sabotage. FAIL:
    U1 is not `unknown`, or removing marker-awareness does not flip it.

- **AC-6 (diagnostic reports the classification, once per ingest).** A
  `classify_submission_<kind>` grading diagnostic is recorded client-side with the
  student count, via the pure `decideClassifyDiagnostic` leaf (which returns
  `null` unless `startedAtMs !== null` AND a classification is present), called
  from BOTH of the chat driver's zip ingest branches (storaged-zip and small-zip
  `file`, section 3.1/4) once per ingest - `submit` is an imperative handler, not
  a render effect, so there is no per-render over-record. The core gains one
  optional `classificationStudentCount?: number` field.
  - Object: the leaf's return under (`startedAtMs: null`), (`classification:
    undefined`), and (both present) per kind; the driver recording exactly ONE
    entry per injected ingest; and a recorded + round-tripped entry. Instrument:
    `gradingDiagnosticLog.test.ts` (leaf, incl. the `startedAtMs === null -> null`
    guard case), the `useContinuousGradingRun` lifecycle test (one record per
    ingest, section 6), and `session-diagnostic-log.test.ts` (count field
    round-trip + CSV column). FAIL: the leaf records when `startedAtMs === null`,
    the driver records zero or more-than-one per ingest, the leaf returns the
    wrong operation/count, the count does not survive JSON/CSV round-trip, or an
    entry without a count gains a spurious key. No exact-set canary bump is needed
    (tsc's `Record<GradingDiagnosticOperation, string>` is the coherence gate;
    section 4).

- **AC-7 (contracts preserved).** No server file imports the diagnostic modules
  (the server-import scan still passes - `ndjson-ingest-parser.ts` carries the
  classification as DATA, it does not import the diagnostic); no emoji/non-ASCII;
  no touched file exceeds 1000 lines (`GradingChatPanel.tsx` has headroom and no
  special ratchet; the dead `GradingTab.tsx` is not touched);
  grouping/parser/collision behaviour byte-unchanged.
  - Object: the repo-wide canaries + the diff. Instrument:
    `session-diagnostic-log.test.ts` server-import scan,
    `src/file-size-ceiling.structure.test.ts` (unconditional; it also still holds
    the now-irrelevant `GRADING_TAB_RATCHET`, which this scope does not touch),
    `src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts`, run via
    `npm run test:paths <p1> <p2> ...` (never a raw multi-path vitest). FAIL: any
    canary red, or a grouping/parser test changes.

---

## 8. WRITE SET AND WAVE PLAN

Dependency waves: Wave 2 depends on Wave 1's `GradingRun.submissionClassification`
field and the NDJSON carrier, so it lands after Wave 1. The two waves share one
file - `useContinuousGradingRun.ts` (Wave 1 threads the carrier into
`rebuildRun`; Wave 2 records the diagnostic in the same submit branch) - so they
SERIALIZE (Wave 1 then Wave 2) on that file, not run in parallel.

### Wave 1 - the detection: classifier + NDJSON carrier + badge (lands first)

Write set (the caller of each new export is included):
- NEW `src/lib/grade/classify-submission-zip.ts` - the pure classifier
  (UNCHANGED from the SHIP-confirmed definition).
- NEW `src/lib/grade/classify-submission-zip.test.ts` - the frozen oracle
  (test-seat content; created here as the write-set member).
- `src/lib/grade/types.ts` - add `SubmissionZipKind`,
  `SubmissionZipClassification`, and `GradingRun.submissionClassification?`.
  (A37 shipped `17a122c3`; these additions are disjoint-named and additive - no
  conflict, see sequencing below.)
- `src/lib/grade/extraction.ts` - `ingestZipEntries` computes and returns
  `classification` (CALLER of the new export).
- `src/lib/grade/engine.ts` - `gradeSubmissions` sets it on the returned
  `GradingRun`, incl. the empty-results return branch (`:587-592`, section 2.3).
  (A37 shipped; additive, no conflict.)
- `src/lib/grade/extraction.test.ts` / `engine` test - assert the field is
  populated (class + single fixtures).
- `src/lib/grade/ndjson-ingest-parser.ts` (+ `.test.ts`) - THE b-CARRIER hop 2:
  add `classification?` to `IngestLedger`, stamp it on the `done` line in
  `buildIngestLines`, and parse it (new validator) onto
  `IngestOutcome.ledger.classification` with a graceful `undefined` fallback
  (section 3.1).
- `src/app/api/grade-submission-zip/route.ts` - pass
  `outcome.value.value.classification` into `buildIngestLines` (hop 1->2).
- `src/app/components/grading/incrementalRunPlan.ts` (+ `.test.ts`) - add
  `submissionClassification?` to `BuildIncrementalRunParams` and set it on
  `buildIncrementalRun`'s returned run (hop 4).
- `src/app/components/grading-chat/chatSubmissionIntake.ts` - add
  `classification?: SubmissionZipClassification` to `IntakeOutcome`'s `"entries"`
  branch (`:54-56`) - the second chat zip path's carrier (section 3.1).
- `src/app/actions/grading-chat-intake.ts` - THE file that surfaces the value on
  the second path (BLOCKER-1 fix): change `resolveOnePart`'s zip branch (`:200-204`)
  to call `ingestZipEntries` DIRECTLY, read `{ entries, classification }`, and
  return it on the `"entries"` outcome (replacing the `extractStudentEntries`
  call that discarded it). `extractStudentEntries` is NOT changed - its other
  callers are untouched. Disjoint from A37 (a chat-intake action, not engine/types).
- `src/app/components/grading-chat/useContinuousGradingRun.ts` - hop 3: add
  `classificationRef`, capture the classification in BOTH zip branches (the
  storaged-zip branch from `ingest.ledger.classification`, and the file branch
  from `outcome.classification`), clear it in `reset()`, and pass it through
  `rebuildRun` to `buildIncrementalRun`. (SHARED with Wave 2.)
- NEW `src/app/components/grading/SubmissionClassificationBadge.tsx` - the badge
  leaf (reading claim).
- `src/app/components/grading-chat/GradingChatPanel.tsx` - mount the badge in the
  stream block (`:515-517`) reading `driver.run.submissionClassification`.
  Re-measure `@(Get-Content).Count` at build (563 now, 1000 ceiling, no ratchet).

Wave 1 gate: `src/file-size-ceiling.structure.test.ts` (unconditional) +
`classify-submission-zip.test.ts` + `ndjson-ingest-parser.test.ts` +
`incrementalRunPlan` test + the `useContinuousGradingRun` lifecycle test +
`extraction`/`engine` tests + `source-bytes.structure.test.ts` +
`no-emojis.test.ts`, via `npm run test:paths`.

### Wave 2 - the diagnostic rep (lands after Wave 1)

Write set:
- `src/lib/session-diagnostic-log.ts` (+ `.test.ts`) - optional
  `classificationStudentCount?: number`, the 7-point blast of section 4.
- `src/app/components/grading/gradingDiagnosticLog.ts` (+ `.test.ts`) - the three
  `classify_submission_<kind>` operations, labels, the start-time-GUARDED
  `decideClassifyDiagnostic` leaf, and `recordClassifySettled` (section 4). No
  `classificationFromRun` narrower is needed on the chat path (the value comes
  straight off `ingest.ledger.classification`).
- `src/app/components/grading-chat/useContinuousGradingRun.ts` - call
  `recordClassifySettled` in BOTH zip branches (storaged-zip `:307-331` from
  `ingest.ledger.classification`; small-zip `file` `:371-404` from
  `outcome.classification`), each with a `chatSeamNowMs()` start captured before
  its ingest/prepare call. Once per ingest (the handler runs once per submit).
  (SHARED with Wave 1 - serializes behind it.)
- `src/app/components/grading-chat/useContinuousGradingRun.<lifecycle>.test.ts` -
  the one-record-per-ingest wiring test (section 6).

Wave 2 gate: `gradingDiagnosticLog.test.ts` + `session-diagnostic-log.test.ts`
(its server-import scan is in-set) + the `useContinuousGradingRun` lifecycle test
+ `file-size-ceiling.structure.test.ts` (unconditional) + `source-bytes` +
`no-emojis`, via `npm run test:paths`.

### Disjointness and A37 sequencing

- The two waves SHARE `useContinuousGradingRun.ts`, so they serialize (Wave 1
  then Wave 2), never concurrent.
- **A37 SHIPPED (`17a122c3`).** It added `GradingSource`/`source` to `types.ts`
  (`:167,181,298`). Wave 1's additions (`SubmissionZipKind`,
  `SubmissionZipClassification`, `GradingRun.submissionClassification?`) are
  disjoint-named and additive, so the rebase onto A37's landed `types.ts` /
  `engine.ts` is mechanical and additive - no real conflict. Re-measure the two
  files' line counts at build (additive edits move them slightly), but there is
  no sequencing wait.
- `GradingTab.tsx` and `useWholeRunDiagnostic.ts` are NOT touched by this
  re-baselined scope (W2 made them dead). The `GRADING_TAB_RATCHET` is not
  re-pinned.
- The repo-wide canaries (`file-size-ceiling`, `source-bytes`, `no-emojis`) read
  every file as SOURCE TEXT and can redden a correct change - every wave gate
  includes them.

---

## 9. FORKS (recommendations; build startable on each)

- **F1 - ambiguous flat multi-file zip: `unknown` vs `single`.** RECOMMEND
  `unknown` (section 2.1). It is the honest answer: a flat zip of several bare
  files is indistinguishable from a markerless loose bundle, and labelling it
  `single` risks the A41 collapse reading the other way. The owner may prefer
  `single` (assume one person). Startable on `unknown`; flipping the fallback is
  a one-line change to the final `else` branch.
- **F2 - diagnostic encoding: 3 kind-operations + one count field (recommended)
  vs one `classify_submission` operation + a richer structured field.** RECOMMEND
  the three operations + the `durationMs`-shaped count field (section 4): it keeps
  the core change to one well-precedented optional number and encodes the kind in
  the existing operation string. Startable as recommended.
- **F3 - diagnostic coverage of the chat/Canvas/bulk-route paths.** RECOMMEND
  main-tab whole-run only in Wave 2 (the owner's actual zip flow), carrying the
  rest as RES-ZIP-CLASS-DIAG. Startable as recommended.

None needs an owner answer to START the recommended reading; the owner redirects
if wrong.

---

## 10. DISPOSITION TABLE

No prior SHIPPED version of `docs/zip-class-vs-single-scope.md` exists (it is new
this session; `git status` showed it untracked/absent at HEAD `b10e6aad`). There
is no prior scope to map kept/handed-over/withdrawn against. This revision is a
RE-BASELINE of the unshipped draft, not a disposal of shipped work; the
within-draft moves W2 forced:

| prior-draft element | disposition | why |
|---|---|---|
| classifier leaf, `GradingRun` carrier, 10 fixtures, forks F1-F3 | KEPT | SHIP-confirmed; W2 did not touch the classifier |
| badge host `GradingTab.tsx` | WITHDRAWN -> re-homed to `GradingChatPanel.tsx:515-517` | W2 unmounted GradingTab |
| `GradingNotesCard` extraction + `GRADING_TAB_RATCHET` re-pin | WITHDRAWN | moot - new host has headroom, GradingTab not touched |
| carrier `engine.ts` -> `GradingRun` -> GradingTab settle | WITHDRAWN as the LIVE path -> replaced by the NDJSON carrier (section 3.1) | the chat UI never reads `gradeSubmissions`'s return; it reads the NDJSON stream |
| diagnostic host `useWholeRunDiagnostic.ts` | WITHDRAWN -> re-homed to the chat driver's ingest handler | that hook is GradingTab-only, now dead |

Related in-tree work, NOT predecessors:
- `docs/BACKLOG.md` A41 - the silent-collapse BUG on non-convention zips. This
  item is COMPLEMENTARY: the `unknown` classification surfaces the ambiguity A41
  describes, but does not fix the collapse. A41 stays open; cite it, do not close
  it.
- `docs/BACKLOG.md` A44/A45 - the collision-refusal ATTRIBUTION work. This item
  READS the same structural signals (`reachedStemFallback`, folders, chains) but
  touches none of that code (section 5).
- **A37 (SHIPPED `17a122c3`)** - added `GradingSource`/`source` to `types.ts`;
  Wave 1's carrier additions are disjoint-named and additive, so the rebase is
  mechanical (section 8).

---

## 11. RESIDUAL REGISTER

Each entry names an owner, an instrument, and the step that measures it. These
belong in `docs/BACKLOG.md` when this item is chunked; a residual not in the
backlog does not exist.

- **RES-ZIP-CLASS-WALK - the chat badge render is a reading claim.** Owner: the
  owner (owner-walk; no component renders under vitest, `this-repo.md:134`).
  Instrument: a browser walk of the chat panel - drop in a real class zip and a
  real single upload. Step: owner confirms the badge in the stream block
  (`GradingChatPanel.tsx:515-517`) shows "Class bundle - N students" / "Single
  submission" / "Could not determine" for the latest zip ingest. Cited: section 3.2.
- **RES-ZIP-CLASS-DIAG - diagnostic rep on the non-zip chat submissions (text,
  single file, Canvas URL) and any future non-chat grading path.** Owner: the
  next diagnostics wave. Instrument: the `useContinuousGradingRun` lifecycle test.
  Step: if the owner wants a classification diagnostic for non-zip submissions
  (each is trivially "single"), record it on those submit branches too; this
  scope instruments only the storaged-zip ingest, where class-vs-single is the
  real question. Cited: section 4, 8.
- **RES-ZIP-CLASS-A41 - the silent-collapse bug A41 is NOT fixed by this item.**
  Owner: A41's owner. Instrument: A41's own repro (a flat zip whose files share a
  leading alphanumeric run). Step: A41's remedy, unchanged. This item only
  SURFACES the ambiguity (`unknown`); it does not prevent the collapse. Cited:
  `docs/BACKLOG.md` A41.
- **RES-ZIP-CLASS-SIGNAL - the `signal` enum is a FLOOR.** Owner: the test seat.
  Instrument: the oracle's `signal` assertions. Step: refine the `signal`
  vocabulary if a fixture needs a value not in the section-2.2 set; `kind` /
  `studentCount` / `markerStudentCount` remain the pinned facts.
