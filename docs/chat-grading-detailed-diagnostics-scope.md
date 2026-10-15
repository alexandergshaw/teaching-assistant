# Scope: detailed diagnostics for the chat LLM grading page

Owner request, verbatim: "i need detailed diagnostics for the chat llm grading page".
Author seat: loop-seat (Sonnet). READ-ONLY artifact: no production file was
edited, and `docs/BACKLOG.md` was not touched (the filing is the orchestrator's
step; a proposed row is in section 13). A fresh checker reads this before any
consumer does, so every claim below names the command or `file:line` that
produced it and says what was opened. ASCII only, no emojis. Default ON;
nothing ships dark.

"The chat LLM grading page" is read as the GRADING-CHAT surface: `GradingChatPanel`
(`src/app/components/grading-chat/GradingChatPanel.tsx`), mounted from
`src/app/page.tsx`, driven by `useContinuousGradingRun.ts`, grading each row
through `POST /api/grade-run-item` -> `gradeEntries` (`src/lib/grade/engine.ts`).
Every server call on that path is owner-gated: `requireAppOwner()` at
`src/app/api/grade-run-item/route.ts:251`, and
`src/app/actions/grading-chat-intake.ts:77,:140`.

No prior version of this document exists (`ls docs/chat-grading*` before writing:
none), so there is no disposition table. The nearest sibling is
`docs/lms-connectivity-diagnostics-deep-scope.md` (Canvas network causes); this
document does not restructure it, and section 8 states exactly where the two
collide.

---

## 0. READ FIRST - what the code actually does (four findings that shape the design)

### 0.1 The grade path already receives token counts, per-call time and the
finish reason, and throws all three away

`callLlm` returns, on success, `usage` (`promptTokenCount`, `candidatesTokenCount`,
`totalTokenCount`), `elapsedMs` and `finishReason` (`src/lib/llm.ts:207-208`
type; `:564` elapsed; `:590` usage). The engine's one model call site
(`scoreAxis`, `src/lib/grade/engine.ts:119-125`) reads `result.text` and
`result.finishReason` (for the guard at `:136`) and nothing else. `usage` and
`elapsedMs` are never read anywhere on the grading path. So "prompt size / token
usage" is not missing because it is unavailable; it is missing because nobody
read a field that is already on the object.

### 0.2 Every failed grade is the same two words in the log

`useContinuousGradingRun.ts:320-331` records `grade_item` with
`failureClass: result.ungraded ? "grade failed" : null` on the resolved path, and
`classifyChatSeamFailure(err) === "timed out" ? "timed out" : "grade failed"` on
the rejected path. Every one of these cannot be told apart in the export:
Gemini 400 (rejected request), 429 (quota), 5xx, a response cut off at the token
cap, a safety stop, unparseable JSON, the route's 50 s soft budget, an auth
failure, a lost network. The distinguishing facts exist at the throw sites
(`engine.ts:128-143`, `route.ts:331-339`) as message TEXT only, and the text is
not safe to forward (finding 0.3).

### 0.3 The raw failure text is not safe to put in the log, so the class must be
TYPED where it is thrown

`normalizeGeminiError` (`src/lib/grade/parsing.ts:295-307`) embeds Gemini's own
error detail in the thrown message (`Gemini said: "<detail>"`). The intake
action's `catch` blocks return `err.message` verbatim as a refusal reason
(`grading-chat-intake.ts:239,:260,:314`), and the collision refusal names students
(`chatSeamDiagnostic.ts:7-9` says so in its own header). The session log scrubs
SECRETS only (`redactEmbeddedSecrets`, `session-diagnostic-log.ts:246`), not
people. So the existing discipline - record a fixed class, never the text - has
to be extended with a finer class that is assigned where the failure happens, the
same construction `VideoFailureClass` already uses (`src/lib/grade/video-failure.ts`
header: "never recovered from message text"). Parsing the finer class back out of
prose would repeat the defect that header records (the existing text classifier
tests `limit` before `too large`, `chatSeamDiagnostic.ts:42-43`).

### 0.4 A latent hazard on the exact lines this work must edit

In `pump()` the chain is `dispatchItem(request).then(A).catch(B).finally(C)`
(`useContinuousGradingRun.ts:311-352`). `A` calls `recordArrival(<graded row>)`
then `recordChatSeamSettled(...)`. If anything in `A` after `recordArrival`
throws, `B` runs and calls `recordArrival(classifyItemFailure(...))`, which
OVERWRITES the graded arrival with a failed one (`recordArrival` is last-wins by
`sourceIndex`, `:296-300`). Today `A`'s tail is one small function, so this is
dormant. This increment puts materially more code in `A` (building a detail bag),
so a throw in a diagnostic builder could turn a successful grade into a failed
row. The design therefore wraps every diagnostic build in a never-throw guard
(section 4.6, AC-24). The diagnostics must not be able to change a grade.

---

## 1. Leverage claim and diagnostics representation (for loop-ac, not rulings)

Diagnostics representation (`DEV_LOOP.md`, "Diagnostics representation"): this
increment IS the diagnostic. What it reports: per-submission model, token
counts, timings (queue wait, client, server, model), attempt/trigger, a typed
failure class, result-quality signals (areas parsed vs expected, did-right /
did-wrong presence, truncation, link and code outcome), intake transport and
sizes, and run settings. The failure it makes visible: a slow, failed or poor
grade can be attributed to a stage (queue, transport, prep, model, parse) instead
of reading "grade failed".

Leverage claim (one paragraph, `docs/loop/leverage.md` format): the nearest
class is GUARANTEED - the failure class on every grade row is assigned by a typed
throw at the failure site, not recovered from model or error prose, so the log
states a property of the pipeline regardless of what the model returned. What the
owner does instead today: reads the failed row's cell text, then opens
Settings > Diagnostics and downloads a session log whose `grade_item` rows say
only "grade failed" with a duration. Cost: the owner cannot tell a quota problem
from a prompt problem from a truncation, so each is debugged by guessing. I am
not certain GUARANTEED is the right class - this is an operability feature and
`leverage.md` itself says a class is earned only when the feature built the
mechanism; loop-ac owns the exact class. Removal test (the one criterion that
goes RED when the advantage is removed): replace the typed `GradeCallError`
throws in `scoreAxis` with plain `Error` (the advantage removed) and AC-1's
frozen table goes red because every row falls to `unclassified`.

---

## 2. Inventory: what the chat-grading path records today, and what it drops

All `file:line` below were opened. "Recorded" means a `recordSessionDiagnosticEntry`
reaches the store through `recordGradingDiagnosticEntry`
(`gradingDiagnosticLog.ts:84-98`).

| Stage | Recorded today | Dropped (available at that site) |
|---|---|---|
| Run header (`beginSession`, `useContinuousGradingRun.ts:405-434`) | `resolve_header` duration + a coarse class on refusal (`:414-418`) | Settings in force, all in hand at `:427-430`: harshness, feedback word target, naming deduction, length deduction; whether the rubric was generated (`header.generatedRubric`, `:821`), criteria count (`header.criteriaNames`), rubric fingerprint (`:820`), instructions/rubric lengths |
| Pre-intake gate, panel (`GradingChatPanel.tsx:491-501`) | Nothing for the body-vs-storage transport choice, a transport refusal (`:492`), a body pre-flight refusal (`:494-495`), or a zip upload failure (`submitStoragedZip`, `:424-425`). Video gate refusals ARE recorded (`videoClient.ts:133,:138,:147`) | Transport kind (`chooseZipTransport` / `chooseSingleFileTransport`, `grading-zip-transport.ts:49-65,:98-114`), file size, extension, which gate refused. Single-file upload failure (`singleFileClient.ts:100`) records nothing |
| Prepare: zip ingest (`:452-495`) | `classify_submission_*` with kind + studentCount (`gradingDiagnosticLog.ts:160-172`); one `prepare_video` per counted in-zip video (`videoDiagnostic.ts:51-64`) | A NON-video ingest refusal records nothing (`:465-470` records only `if (ingest.videoFailure)`); ledger counts `studentsFound/studentsEmitted/skipped/failedSupportedFiles` (`:474-479`, type `ndjson-ingest-parser.ts:20-29`); classification `signal` and `markerStudentCount` (`types.ts:535-542`); the `No student submissions were found` refusal (`:492-494`); reset-during-prepare refusals (`:471`,`:530`,`:564`) |
| Prepare: storaged video / file (`:496-567`) | `prepare_video` (`:509,:512`); `prepare_submission` for the single-file lane (`:558`) | File size and extension; the reason class is the coarse text class |
| Prepare: file / url / composite (`:568-646`) | `prepare_submission` duration + coarse class (`:630-634`); `classify_*` (`:641`) | Entry count, total content chars, file counts, per-source name-resolution counts (`studentNameSource`, `types.ts:517`), URL kind; empty-text and empty-composite refusals (`:569-571`, `:587-589`); the one-Canvas-URL-per-session refusal (`:577-582`) |
| Admission and the 40 ceiling (`:651-695`, `:701-729`) | Nothing | `available <= 0` refusal (`:652-657`), the clip of an oversized batch (`:663-664`), zip-skipped students (`:678-693`), the recording-split confirm/reject decision and its clip (`:701-729`). `DEFAULT_MAX_ENTRIES = 40` (`:79`) is a CLIENT constant; the engine's own `getGeminiMaxSubmissions()` (`gemini.ts:32`, 40) cannot bind here because the route passes exactly one entry |
| One-vs-many recording (`recordingSplitDriver.ts:69`) | `classify_recording_single/multiple` with a segment count, or a fixed failure string (`gradingDiagnosticLog.ts:209-224`) | The instructor's confirm/reject, the number admitted after the cap |
| Dispatch (`pump`, `:302-354`) | `grade_item`: outcome + client `durationMs` + a two-valued class (`:320-331`); a typed video class as a separate `prepare_video` entry (`:334-337`) | Attempt number and trigger (first vs `retry` `:733-742` vs `regrade` `:747-762` are indistinguishable); queue wait (enqueued `:394-395`, dispatched `:310`); in-flight count (`inFlightRef`, `:305`); HTTP status (dropped in `postGradeRunItem`, `:200-202`); the result's own quality fields, all already on the client: `rubricAreas.length`, `totalScore`, `strengths`/`improvements` presence, `submissionTruncated` (`types.ts:318`), `linkFetch` (`:308`), `codeExecution` (`:294`) |
| Route (`route.ts:243-355`) | nothing server-side | `startedAtMs` exists (`:244`) and is only used for the budget; the success body is `{ sourceIndex, result }` (`:351`) with no timing, model, token or call-count; error bodies carry the message only (`:333-339`, `:344-349`, `:353`); 400/401 bodies (`:253,:262,:269,:274`) carry no class |
| Engine (`engine.ts`) | nothing | `usage` / `elapsedMs` (finding 0.1); model name (`getGeminiModel()`, `llm.ts:526`); number of model passes (1, or 2 for a discussion with a reply section, `:262,:277`); finish reason of a successful call; which guard fired (`:136-143`); truncation size (`:428-441`); code run outcome (`:450`) |
| LLM transport (`llm.ts:403-512`) | nothing | Retry count: `postGenerateContent` retries up to `MAX_ATTEMPTS = 5` (`:403`) and `elapsedMs` deliberately excludes the backoff (`:550-564`). Not surfaced; see fork F6 |

Two facts that bear on what "provider" can mean: `callLlm` ignores its provider
argument (`llm.ts:391`, `void provider;`), so the request's `provider` field is
not the model actually used; the design records `model` (from `getGeminiModel()`,
the getter `callGemini` itself uses at `:526`), never `provider`.

Budget fact: the whole session log is capped at 500 entries
(`MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES`, `session-diagnostic-log.ts:185`), oldest
dropped first (`:254-259`). A 40-row run records, by reading the code, about 1
`resolve_header` + 1 `prepare_submission` per file/url row + 1 `grade_item` per
row + `prepare_video` fan-out per in-zip video (`videoDiagnostic.ts:51-64`: one
entry per video, so a zip of 30 videos is 30 entries). This is derived from
reading, not from a run (no run is possible here). It is why the design
enriches existing entries instead of adding per-row entries (fork F7, AC-22).

---

## 3. Measured facts (each names its command)

| Fact | Command | Result |
|---|---|---|
| File sizes that bound the plan | `wc -l <file>` (Bash) and `@(Get-Content <file>).Count` (PowerShell), both run on the same 12 files | identical on all 12: hook 838, panel 798, `GradingResults.tsx` 997, engine 706, route 355, `session-diagnostic-log.ts` 557, its test 797, `gradingDiagnosticLog.ts` 246, `chatSeamDiagnostic.ts` 110, `grading-chat-intake.ts` 392, `SessionLogSection.tsx` 204, `llm.ts` 828 |
| Ceiling | `grep -n "LIMIT = 1000" src/file-size-ceiling.structure.test.ts` | `:41` |
| `GradingResults.tsx` headroom | `@(Get-Content src/app/components/GradingResults.tsx).Count` | 997, i.e. 3 lines under the wall: no per-row affordance can be added there without an extraction first (R1) |
| Existing `CHAT_SEAM_FAILURE_CLASSES` | read `chatSeamDiagnostic.ts:21-32` | 10 members; the existing test only asserts `toContain` (`chatSeamDiagnostic.test.ts:36`), so nothing pins the count |
| Sibling-file disjointness | `sort A.txt B.txt \| uniq -d` over the write sets in section 7 (canary: `sort t1 t2 \| uniq -d` printed `b` for `a,b`/`b,c`) | WA x connectivity W1/W2/W3 empty; WB x connectivity W2 = 7 files, WB x W3 = 2 files; see section 7 |
| Gate scripts | `Select-String package.json -Pattern '"docs:gate"\|"test:paths"'` | both present (`:21`, `:22`) |
| This document passes the docs gate | `npm run docs:gate` (wrapper output: `COVERED` x3 for `no-emojis.test.ts` 18, `source-bytes.structure.test.ts` 3, `gate-commands.structure.test.ts` 28) plus `LC_ALL=C tr -d '\11\12\15\40-\176' < docs/chat-grading-detailed-diagnostics-scope.md \| wc -c` | all passed; non-ASCII byte count 0 |

What I did NOT measure and do not claim: how many entries a real 40-student run
produces, real token counts, real latencies, the Vercel runtime behaviour. There
is no `.env`, no network and no component rendering here
(`docs/loop/this-repo.md` section 6).

---

## 4. Design

### 4.1 Entry shape: ONE optional `detail` field, closed vocabulary per operation

`SessionDiagnosticEntry` gains one optional field, omitted (never an explicit
`undefined`, matching `:247-251`):

```
detail?: Readonly<Record<string, number | boolean | string>>
```

Rationale: the connectivity increment is already adding `cause`, `code`,
`serverMs` columns after Host (its section 4.6). Adding another dozen typed
columns for grading would widen every export for rows that mostly leave them
blank, and would put two efforts on the same column positions. One `detail` cell
(CSV: ONE new column `"Detail"`, JSON: an object) lets each operation own its
vocabulary (the pattern `contentDiagnosticLog.ts` and `gradingDiagnosticLog.ts`
already follow for labels) without touching the shared header again.

The core enforces a GENERIC backstop at the single write path
(`recordSessionDiagnosticEntry`, `:237-260`), the same place scrub-then-cap
already lives:

- key matches `^[a-z][A-Za-z0-9]{0,23}$`, else the pair is dropped;
- number: finite, rounded to an integer, magnitude <= 1e12, else dropped;
- boolean: kept;
- string: matches `^[a-z0-9][a-z0-9._-]{0,63}$`, else dropped (no spaces, no
  capitals, no `=`/`;`/quote, so the CSV encoding below is unambiguous);
- at most 40 pairs (keys sorted, first 40 kept); empty after scrub -> `detail`
  omitted.

HONEST LIMIT OF THAT BACKSTOP: a lowercase student first name such as `ada`
passes the string regex. The regex cannot tell a name from a token. The real
control is CONSTRUCTION: the bag is built only by a typed function whose
parameters are numbers, booleans and members of closed unions (section 4.2), with
no string-typed parameter that could carry a name (the single exception is
`model`, an owner-set env value). Section 6 and AC-13 test the construction, not
the regex.

CSV: one appended column `"Detail"` holding `key=value;key=value` with keys
sorted (values contain none of `=`, `;`, `"`, comma by the regex, though `csvRow`
would quote them anyway - `course-tasks-view-csv.ts:55-57`). The cell always
starts with a lowercase key letter, so it can never begin with `=`, `+`, `-`, `@`
(spreadsheet formula prefixes). JSON export already spreads entries
(`session-diagnostic-log.ts:466-483`); `detail` rides as an object.
`parseOneEntry` (`:516-547`) reads it optionally and re-applies the same
validator, so an export without it still parses (the `host`/`durationMs`
precedent at `:539-545`) and a hand-edited export cannot smuggle a bad value in.

### 4.2 The taxonomy: every field, the site it comes from, the bag it goes in

Legend for the Source column: C = client, already in hand at that code site;
S = server, new (carried by the envelope of section 4.4); D = derived by a pure
function from C/S values. A field with no real source is not listed (nothing
below is invented).

#### A. `grade_item` (existing entry, enriched; `error` stays one of the existing 10 classes)

| key | type | Source and site |
|---|---|---|
| item | int | C: `request.sourceIndex + 1` (`:307`) |
| attempt | int | C: new per-row dispatch counter (a `Map<sourceIndex, number>` ref) |
| trigger | first / retry / regrade | C: set by `retry()` (`:733`) and `regrade()` (`:747`), default first |
| waitMs | int | C: enqueue (`enqueueAdmitted` `:394-395`) to dispatch (`:310`) |
| inflight, queued | int | C: `inFlightRef.current` after increment (`:305`), `queueRef.current.length` after shift (`:304`) |
| httpStatus | int | C: `res.status` in `postGradeRunItem` (`:194-202`); absent on network loss |
| serverMs, prepMs, gradeMs | int | S: route `Date.now()-startedAtMs` (`route.ts:244`); time before `gradeEntries` starts (link resolution, video prep); time inside it |
| modelMs | int | S: sum of `result.elapsedMs` over passes (`llm.ts:564`) |
| netMs | int | D: `max(0, clientMs - serverMs)` = transit + platform cold start |
| model | token | S: `getGeminiModel()` (`gemini.ts:98`) |
| passes | int | S: number of `callLlm` calls actually made (0, 1 or 2) |
| promptTokens, outputTokens | int | S: sums of `usage.promptTokenCount` / `candidatesTokenCount`; ABSENT (not 0) when the model reported none |
| finishReason | token | S: last call's `result.finishReason` if it matches `^[A-Z_]{3,40}$`, lowercased on write |
| failure | member of `GRADE_FAILURE_CLASSES` | S for model/route classes; C for `transport-lost` / `request-refused` (section 4.3) |
| areas, areasExpected | int | C: `result.rubricAreas.length`; `header.criteriaNames.length` |
| scored | bool | C: `result.totalScore !== ""` |
| splitAsked, hasPraise, hasAdvice | bool | C: `commentSplit` request flag; `strengths.trim() !== ""`; `improvements.trim() !== ""` - the did-right / did-wrong presence the owner named |
| truncated | bool | C: `result.submissionTruncated === true` (`types.ts:318`) |
| contentChars, files, visualFiles, wireKb | int | C: `request.entry.content.length`; `submittedFiles.length`; count where `graderReadsFileBytes(mimeType)` (`incrementalRunPlan.ts:102`); `estimateNeededWireBytes(entry)/1024` (`:125`) |
| video, windowed | bool | C: any `videoRef` (`:769`); `gradeWindowSec` present |
| link | none / ok / failed / flagged | C: `result.linkFetch` (`types.ts:308`) |
| code | none / ran / failed / needs-input | C: `result.codeExecution` -> `ran`, `error`, `neededStdin` (`code-runner.ts:48-59`) |
| rubricFp | token (12 hex) | C: first 12 chars of `header.rubricFingerprint` (`:820`): an instructor-content hash, not student data |

This is the owner's list mapped onto data that exists: model/provider (model
only, see section 2), prompt size / token usage (tokens, contentChars, wireKb),
elapsed (client / server / model / queue), retry count (attempt + trigger here;
LLM-internal retries: fork F6), needs-retry / truncated / unparseable
classification (`failure` + `finishReason` + `truncated`), did-right / did-wrong
presence (`splitAsked/hasPraise/hasAdvice`), rubric provenance (`rubricFp`).

#### B. `resolve_header` (existing entry, enriched)

harshness (lenient/balanced/strict), wordTarget (int, absent when unset),
nameDeduct, lengthDeduct, splitOn (bool), rubricSource (typed / generated),
rubricChars, instructionsChars, criteria (int), rubricFp, concurrency (3,
`incrementalRunPlan.ts:32`), cap (`maxEntries`). Source: `beginSession`
parameters and `header` (`:405-434`), all C.

#### C. `prepare_submission` (existing entry, enriched; one new failure entry per gap)

| key | Source |
|---|---|
| inputKind: text / file / url / composite / zip-storage / file-storage / video-storage | C: `input.kind` (`:452-646`) |
| transport: body / storage / video | C: panel gate result (`GradingChatPanel.tsx:491`) |
| stage: gate / upload / prepare / reset / empty / session-pin | C: which branch refused |
| sizeKb, ext (closed list else `other`) | C: `file.size`, extension from `SINGLE_FILE_STORAGE_EXTENSIONS` (`grading-zip-transport.ts:77`) plus `zip`/`pdf`/image set; NEVER the name |
| parts | C: composite `input.parts.length` |
| urlKind: canvas / other | C: `detectCanvasUrlKind(url) !== null` (`:575`); only this coarse split, because the GitHub and Drive parsers are server-side |
| entries, chars, files | C: from `outcome.entries` |
| namesFilename, namesInferred, namesUnresolved | C: counts of `studentNameSource` (`types.ts:517`) |
| found, emitted, skipped, failedFiles | C: ledger lengths (`:474-479`) |
| signal, markers | C: `SubmissionZipClassification.signal` and `markerStudentCount` (`types.ts:535-542`) |
| refusal | closed `IntakeRefusalClass`, typed at the server refusal site (WE; absent until then) |

#### D. Two new operations, recorded ONLY when something notable happens

- `admit_submissions`: requested, admitted, clipped, skipped, cap, reason
  (cap-reached / cap-clipped / zip-skipped / none-found). Failure when the cap
  refused outright (error class `cap exceeded`); success with counts when it
  clipped or skipped. Silent on the ordinary all-admitted path (budget, F7).
- `resolve_recording_split`: decision (confirm / reject), segments, admitted,
  clipped. Source: `settlePendingSplit` (`:701-729`).

Both need a label in `GRADING_DIAGNOSTIC_OPERATION_LABELS` (an exhaustive
`Record`, `gradingDiagnosticLog.ts:42`, so `tsc` enforces it) and a member in the
`GradingDiagnosticOperation` / `ChatSeamOperation` unions.

#### E. `classify_*` entries (existing, enriched): signal, markers (from the
classification), already carrying the student count in
`classificationStudentCount`.

### 4.3 Failure vocabulary: ONE owner, typed at the throw site

New pure leaf `src/lib/grade/grade-failure.ts` (no imports, like
`video-failure.ts`), owning:

```
GRADE_FAILURE_CLASSES = [
  "model rejected request",   // callLlm !ok, status 400
  "model quota",              // 429
  "model unavailable",        // 404
  "model service error",      // 408, 5xx
  "model unreachable",        // status 0 (network or abort)
  "model http other",         // any other non-ok status
  "model cut off",            // finishReason MAX_TOKENS
  "model stopped early",      // every other non-STOP finishReason (token in detail.finishReason)
  "model unparseable",        // no valid grading JSON
  "route budget",             // route soft budget, 504
  "route error",              // route 502 not from the model (inline visuals, code run, link)
  "request refused",          // route 400 / 401 (client-assigned)
  "transport lost",           // client got no usable response (client-assigned)
  "unclassified",
]
class GradeCallError extends Error { failureClass; finishReason?; }
```

`scoreAxis` throws `GradeCallError` carrying the SAME message literals as today
(`engine.ts:129,:137-139,:142`), so the UI text, `ungraded.message`, and every
test that keys on those strings are byte-identical. The mapping from status to
class is by number (`result.status`), and from finish reason is "MAX_TOKENS ->
cut off, everything else non-STOP -> stopped early" - deliberately NOT a
semantic split into blocked / safety / recitation, because I could not verify
Gemini's enum semantics here (recalled, not measured: no network). The raw token
is recorded so the owner can read it next time.

Two safe design choices: the leaf has no imports, so `engine.ts` (whose runtime
import closure is policed by `runtime-import-graph.test.ts`, see the comment at
`engine.ts:36-42`) stays clean; and it is a SEPARATE module rather than an engine
export, because `route.test.ts:175-177`, `route.videoref.test.ts` and
`route.videoseam.test.ts` mock `@/lib/grade/engine` with only `gradeEntries`, so
an `instanceof` against a symbol exported from the mocked module would throw
(the same trap the connectivity scope records for its error class).

### 4.4 Data flow: the server envelope and the never-widening wire

1. `engine.ts`: `GradingRunOptions` gains one optional field,
   `callSink?: GradeCallSink` (`engine.ts:296-331`). `scoreAxis` and the two
   callers (`gradeSubmission` `:203`, `gradeDiscussionAxes` `:246`) take it as a
   trailing parameter and push `{ pass, status|finishReason, usage, elapsedMs }`
   after each `callLlm`. The `catch` at `:492-514` copies
   `error instanceof GradeCallError ? error.failureClass : "unclassified"` onto
   the sink. The sink methods are total (push into an array; no throw path).
   Nothing about prompts, parsing or results changes.
2. `route.ts`: creates the sink, passes it in `options` at both `gradeEntries`
   call sites (`:313-319`, `:325`), stamps `gradeStartedAt` immediately before
   each (so `prepMs` / `gradeMs` split without new dependencies), and returns
   `{ sourceIndex, result, diagnostic }`. Error bodies gain `diagnostic` too
   (`:333-339`, `:344-349`, `:353`) with `failure` = `route budget` / `route
   error`; the `error` string and status codes are unchanged. The 401/400
   pre-parse refusals stay as they are; the CLIENT assigns `request refused` from
   `httpStatus`.
3. The `diagnostic` object is built by a pure builder in
   `src/lib/grade/grade-item-diagnostic.ts` that takes only numbers, booleans,
   and class members (no message string parameter exists). Keys are a frozen
   whitelist `GRADE_ITEM_DIAGNOSTIC_KEYS`.
4. Client: `dispatchItem` gains an OPTIONAL second parameter,
   `sink?: ItemDiagnosticSink`. The default `postGradeRunItem` fills it with
   `httpStatus` and the parsed `body.diagnostic` before returning or throwing.
   Existing injected `dispatchItem` mocks ignore the extra parameter and still
   type-check (a function with fewer parameters is assignable), so none of the
   hook tests that inject a mock change. `parseGradeItemDiagnostic` (client leaf)
   re-validates the wire object with the same whitelist and types, so a
   malformed or future body degrades to "no server detail", not an exception.
5. Other consumers of the route are unaffected: `useIncrementalGradingRun.ts:83-86`
   and `useOneUploadRun.ts:171` read `body.result` / `response.result` only.
   One existing assertion changes: `route.test.ts:252`
   (`toEqual({ sourceIndex: 0, result: fakeResult })`) must admit the new key.
   That is the only existing whole-body assertion: I opened every `res.json()`
   read in that file (`:251,:433,:443,:474,:483,:578`) and the others read single
   keys (`body.result.linkFetch`, `body.error`); `route.videoref.test.ts` and
   `route.videoseam.test.ts` have no whole-body `toEqual`. The WA suite run
   confirms it rather than this reading.

### 4.5 Where it surfaces

**(a) The downloadable session log** (Settings > Diagnostics): the `detail` column
and JSON object of section 4.1. The "recent activity" list on that page
(`SessionLogSection.tsx:80-86`, `describeEntryLine`) shows only
`label: failed - error`; a pure formatter exported from the log module
(`describeSessionDiagnosticDetail(entry)`) appends the few fields a person wants
at a glance (failure class, model, tokens, seconds), and `SessionLogSection`
calls it (WD) so the new data is not visible only in a file.

**(b) An on-page run-diagnostics panel on the chat grading view.** The owner said
"page", and the existing export lives on a different route; so the detail must
also be one click away where the grading happens. Recommended shape:

- A native `<details>` disclosure placed at the end of the results stream inside
  `chatStyles.stream` (`GradingChatPanel.tsx:741-763`), collapsed by default,
  rendered only when the run has rows, below `GradingResults`. Its `<summary>` is
  a one-line summary that needs no click to read: `Run diagnostics - 12 graded, 2
  failed (1 model quota, 1 route budget), slowest 41.2 s, 18,430 tokens`.
- Open, it shows a table (one row per dispatch attempt, newest last): Row label
  (the same string the results table shows), Outcome, Attempt, Queue wait,
  Client / Server / Model seconds, Tokens in/out, Model, Failure, and short flag
  chips (`truncated`, `link not fetched`, `code needs input`, `no did-right`).
  Plus a "Copy diagnostics" control.
- Reuse, no new CSS: container `controls.notice` (as `LedgerNotice`,
  `GradingChatPanel.tsx:170-173`), `<details>` and table classes
  `styles.generatedRubricCard` / `styles.generatedRubricTable`
  (`page.module.css:558,:600`; used by `GeneratedRubricCard.tsx:19-38`), text
  `styles.ghMeta`. These are already theme-aware; I did not render them (no
  component renders here), so dark-theme behaviour of the reuse is a reading
  claim (R11).
- No emojis; no new persisted key: the panel's open state is NOT persisted
  (fork F9) - the chat session itself is not saved
  (`CHAT_SESSION_NOT_SAVED_DISCLOSURE`, asserted rendered by
  `GradingChatPanel.structure.test.ts:21-26`), and a new key would trip the
  frozen-key canary `grading-chat-storage-keys.structure.test.ts`.
- Clicks (a DESIGN claim, not measured): the summary needs 0; the full table 1
  (expand); copying 2. The current alternative is leaving the page for Settings
  > Diagnostics, downloading, and opening a file - at least 3 steps and a context
  switch, count not measured here.

**Why a run-level panel and not a per-row "why" in the results table:**
`GradingResults.tsx` is 997 lines (section 3) and is shared by four mounts
(`backlog-file.structure.test.ts:132-137` records three non-chat mounts that must
stay byte-identical). A per-row affordance cannot be added without first
extracting at least ~50 lines out of it. That is residual R1, not a decision to
skip it.

### 4.6 The diagnostics must not be able to change a grade (reliability)

- Every diagnostic build in the hook is wrapped in a `safeDiagnostic(() => ...)`
  that swallows its own exceptions and records nothing on failure; it sits
  AFTER `recordArrival` and OUTSIDE the `.then` body's throwing path, closing the
  finding 0.4 hazard.
- `sink` methods on the server are total; the route builds the `diagnostic` in a
  try/catch that falls back to `undefined` (the result still returns).
- Failure modes of the diagnostics themselves, with detection and behaviour:
  bad/absent `body.diagnostic` -> parse returns undefined, entry has client
  fields only; `usage` absent -> token keys omitted, not 0; builder throws ->
  grade unaffected, no entry (AC-24); 500-entry cap -> existing drop accounting
  (`:254-259`), and the on-page panel is not capped (hook-local, bounded by 40
  rows plus retries); a platform kill at the 60 s function cap (`route.ts:47`)
  yields no body at all, so the client records `transport lost` with no
  `serverMs` - distinguishable in the export by that absence plus a client
  duration near 60 s, but not provably (R5).
- Rollback: WA alone is revertible (a route-additive key and an engine trailing
  parameter, no persisted shape). WB changes the shared export shape (additive).
  WC/WD are client files; reverting WD removes the panel without touching data.

---

## 5. Forks and recommendations (all acted on; the owner may redirect)

| Fork | Options | Recommendation built here | Cost if wrong |
|---|---|---|---|
| F1 Surface | export only / on-page only / both / inline per-row | BOTH: export columns plus a run-level `<details>` panel; per-row inline is blocked by the 997-line file (R1) | export-only would leave the owner leaving the page; dropping the panel is reverting WD (no data impact) |
| F2 Entry shape | N typed columns / one `detail` bag | ONE `detail` bag with a core backstop and per-operation closed construction | typed columns are safer per field but collide with the connectivity columns and widen every row; bag trades some type safety for isolation - the construction tests (AC-13) are what carry the safety |
| F3 On-page source of truth | read the session store / hook-local list | hook-local `ItemDiagnostic[]` (holds the row label, bounded, cleared by `reset()`, not subject to the 500 cap); the export entry is a PROJECTION built by the same function. Tension: `session-diagnostic-log.ts:11-22` says "one store, never two". Mitigation: the panel list is a run view model (like `results`), not a log, and AC-10 pins one-to-one parity between items and exported entries. The checker should attack this | if the owner wants strictly one store, WD switches to reading the store and joining labels by `item`, at the cost of cap-dropped rows vanishing from the panel |
| F4 Failure class | parse prose / type at source | TYPE at source for the grade (`GradeCallError`) and, in the last wave, for intake refusals (`IntakeRefusalClass`) - the precedent is `VideoFailureClass` | prose parsing mis-buckets (already measured at `chatSeamDiagnostic.ts:42-43`); typing touches ~27 refusal sites in one server action, hence its own wave |
| F5 Labels | omit everywhere / show on page only | show the row label ON THE PAGE (the table already shows it), NEVER in the copied text or the export (they use `Row N`) | an owner screenshotting the panel exposes the same names the results table already exposes; the copy and the file stay clean |
| F6 LLM-internal retry count | add `attempts` to `LlmResult` / derive | DERIVE for now: the panel shows `overheadMs = gradeMs - modelMs` ("time outside the model call, includes retry backoff") because 71 non-test files call `callLlm(` (`grep -rln "callLlm(" src --include=*.ts --include=*.tsx | grep -v test | wc -l`; a file count, not a call-site count) and three failure-shape `toEqual` assertions (`llm.test.ts:629,:646,:852`) that an `attempts` field on the failure branch would break | the owner gets a hint, not a count; follow-up R2 adds `attempts` on the success branch only |
| F7 Entry budget | add per-row entries / enrich | ENRICH existing entries; new operations only for anomalies. A 40-row run adds 0 entries on the all-admitted path (AC-22) | richer separate events would eat the 500-entry cap in a few runs |
| F8 Order vs the connectivity effort | parallel / serialize | WA now (disjoint); WB after connectivity W2 lands (section 8) | the second lander edits the CSV tail assertions |
| F9 Persist panel open state | persist / do not | do not persist (no new `ta-` key) | a persisted default-open state would need a mount effect (`persisted-details-open-hydration` memory) and a frozen-key bump |

---

## 6. Security and PII review

What the chat grading path handles: student names (row labels, file stems),
submission text and files, uploaded file names, Storage paths (`${userId}/
grading-uploads/<uuid>`), submission URLs (a GitHub owner is a student's
username; Canvas ids), repo names (`gradedRepo`), rubric and instructions, and
Gemini error detail. The session log is downloadable and its own help text tells
the owner to "send it when something goes wrong" (`SessionLogSection.tsx:138-139`), i.e. it is treated as shared externally.

| Datum | Recorded? | Control |
|---|---|---|
| Student label / name | NO in the log; YES on the page (already displayed) | no string parameter in the builders; copy uses `Row N` (AC-13, AC-18) |
| File name, extension | name NO; extension only from a closed list else `other` | `ext` is a member check, never a slice of the name |
| Storage path, URL, repo, owner/username | NO | only `urlKind` (canvas / other), `inputKind`, counts |
| Submission text, prompt, rubric, instructions | NO | lengths only (`contentChars`, `rubricChars`, `instructionsChars`); `rubricFp` is a 12-hex hash of instructor content |
| Raw error / refusal text, `ungraded.message` | NO | only members of closed unions; AC-4 and AC-13 use canaries inside a Gemini-400 body and a collision message |
| Token counts, timings, model name, finish-reason token | YES | numbers and an owner-set env value; the regex backstop applies |
| API key | NO | `getGeminiApiKey` is untouched; the route never reads it into the diagnostic |

Residual risk stated plainly: the core regex is a backstop that a lowercase name
would pass (section 4.1). The defence is that no builder accepts a free string.
A future edit that adds a string-typed parameter breaks AC-13 and structure pin
P4, which is why those exist.

Owner gate and egress: no new endpoint, no new server action, no new network
egress. The only server change is an additive key on a response from an already
`requireAppOwner()`-gated route (`route.ts:251`). The guard ratchet scans
`"use server"` action files (`action-guard-coverage.test.ts`), and WA/WC/WD add
none. WE edits `grading-chat-intake.ts` (a `"use server"` file): it adds a field
to returned objects only, no new export, and the file keeps its async-only
exports (`use-server-exports.test.ts`).

Client bundle: the new leaves `grade-failure.ts` and `grade-item-diagnostic.ts`
have no imports; `chatGradeDetail.ts` imports only types and those leaves. None
imports the browser-only log module from a server path
(`session-diagnostic-log.test.ts` bans that import under `src/app/api` and
`src/app/actions`; `route.ts` imports only the two server-safe leaves).

CSV injection: covered in 4.1 (cells begin with a lowercase letter).

Adjacent finding, NOT fixed here (R6): `useOneUploadRun.ts:180-190` records the
raw `errorMessage` as `error` for the main grading tab's `grade_item`. It is
scrubbed for secrets but not for people, and it is the same operation name the
chat path uses. Out of scope (different surface), but the next grading
diagnostics increment owns it.

---

## 7. Write set, waves, ceiling notes

Disjointness is computed (section 3 command). Waves are sequential where shown.

### WA - typed failure and server envelope (no client change, no schema)
Production: `src/lib/grade/grade-failure.ts` (NEW), `src/lib/grade/grade-item-diagnostic.ts`
(NEW; its callers in this wave are `engine.ts` for the sink type and `route.ts`
for the builder), `src/lib/grade/engine.ts`, `src/app/api/grade-run-item/route.ts`.
Tests: `src/lib/grade/grade-failure.test.ts` (NEW), `src/lib/grade/grade-item-diagnostic.test.ts`
(NEW), `src/lib/grade/engine.diagnostic.test.ts` (NEW), `src/app/api/grade-run-item/route.test.ts`
(edit `:252` only), `src/app/api/grade-run-item/route.diagnostic.test.ts` (NEW).
Must also run (read-only dependents): the other engine tests, the other two
route tests, `src/lib/module-graph/runtime-import-graph.test.ts`,
`src/lib/grade/rubric-provenance-producers.structure.test.ts`.
Disjoint from connectivity W1/W2/W3 (empty `uniq -d`). Can start now.

### WB - the shared core: `detail` field, wrappers, coverage text
Production: `src/lib/session-diagnostic-log.ts`, `src/app/components/grading/gradingDiagnosticLog.ts`,
`src/app/components/grading-chat/chatSeamDiagnostic.ts`.
Tests: `src/lib/session-diagnostic-log.detail.test.ts` (NEW),
`src/lib/session-diagnostic-log.test.ts` (header/tail assertions only),
`src/app/components/grading/gradingDiagnosticLog.test.ts`,
`src/app/components/grading-chat/chatSeamDiagnostic.test.ts`,
`src/app/components/grading-chat/chatSeamDiagnostic.wiring.test.ts`.
Callers of every new export are in WC/WD (the formatter's caller is WD); the
exports are consumed within this chain, which the wave gate must say explicitly
(a type-and-recorder wave whose callers land one wave later is the sanctioned
shape here, because WB cannot be reached by a user without WC).
SHARED with connectivity W2 (7 files) and W3 (2 files): see section 8.

### WC - client driver, intake record sites, pure leaf
Production: `src/app/components/grading-chat/chatGradeDetail.ts` (NEW),
`useContinuousGradingRun.ts`, `GradingChatPanel.tsx` (the gate record
sites at `:424-425`, `:491-501`; no UI yet).
Tests: `chatGradeDetail.test.ts` (NEW), `useContinuousGradingRun.itemdiag.test.ts`
(NEW, harness copied from `useContinuousGradingRun.diagnostic.test.ts`, never
imported), `GradingChatPanel.diagnostic.wiring.test.ts` (NEW). Must also run:
every `useContinuousGradingRun.*.test.ts`, `GradingChatPanel.structure.test.ts`,
`grading-chat-storage-keys.structure.test.ts`, `video-w4.wiring.test.ts`.
Depends on WA (wire type) and WB (the `detail` argument).

### WD - the on-page panel and the Settings recent-list formatter
Production: `ChatRunDiagnostics.tsx` (NEW), `GradingChatPanel.tsx` (mount, ~8
lines), `src/app/account/diagnostics/SessionLogSection.tsx` (calls
`describeSessionDiagnosticDetail`). Tests: `ChatRunDiagnostics.wiring.test.ts` (NEW).
Depends on WC. Shares `GradingChatPanel.tsx` with WC, so serialized.

### WE - typed intake refusals (separable; last)
Production: `src/app/actions/grading-chat-intake.ts` (class on each of the ~27
refusal returns, `reason` text untouched), `chatSubmissionIntake.ts`
(`IntakeRefusalClass` list and the optional field on the refused branch),
`useContinuousGradingRun.ts` (one line reading `outcome.refusalClass`). Tests:
`src/app/actions/grading-chat-intake.refusal.test.ts` (NEW; the existing
`grading-chat-intake.test.ts` and `.video*.test.ts` also run). Shares the hook
with WC, so after it. Dropping WE leaves WA-WD whole; the `refusal` key is then
simply absent.

Gate command for every wave (two or more paths -> the wrapper, never raw vitest),
shown for WA; each later wave substitutes its list:

`npm run test:paths src/lib/grade/grade-failure.test.ts src/lib/grade/grade-item-diagnostic.test.ts src/lib/grade/engine.diagnostic.test.ts src/lib/grade/engine.test.ts src/lib/grade/engine.ungraded.test.ts src/lib/grade/engine.inline-visuals.test.ts src/lib/grade/engine.video-window.test.ts src/lib/grade/reply-axis-scoring.oracle.test.ts src/lib/grade/harshness-engine-default.wiring.test.ts src/lib/grade/rubric-provenance-producers.structure.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/app/api/grade-run-item/route.test.ts src/app/api/grade-run-item/route.diagnostic.test.ts src/app/api/grade-run-item/route.videoref.test.ts src/app/api/grade-run-item/route.videoseam.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts src/tools/strip-comments-agreement.structure.test.ts`

then the full `npm test`, then `npx tsc --noEmit` (single caller), then `npm run
lint` (pass = exit 0 and no NEW warning in the wave's files; do not pin a count),
then `npm run build` and grep the `Compiled successfully` line (the exit code is
not the gate, `docs/loop/this-repo.md` section 1). For this docs-only commit the
gate is `npm run docs:gate`.

### Ceiling table (measure with `wc -l`; expected changes are estimates, re-measure)

| File | Now | Expected | Risk |
|---|---|---|---|
| `useContinuousGradingRun.ts` | 838 | +50 (WC) +5 (WE) = ~893 | headroom ~107; keep ALL building in `chatGradeDetail.ts`; if the hook passes ~930, extract before the next feature (ModulesView-at-ceiling lesson) |
| `GradingChatPanel.tsx` | 798 | +25 (WC gates) +8 (WD) = ~831 | headroom ~169 |
| `engine.ts` | 706 | ~+35 | none |
| `route.ts` | 355 | ~+45 | none |
| `session-diagnostic-log.ts` | 557 | ~+75 (WB), plus connectivity ~+40 = ~672 | none |
| `session-diagnostic-log.test.ts` | 797 | assertions edited only; connectivity adds ~70 | none (~870) |
| `grading-chat-intake.ts` | 392 | ~+35 (WE) | none |
| `GradingResults.tsx` | 997 | NOT TOUCHED | at the wall (R1) |

---

## 8. Coordination with the connectivity diagnostics effort (flag for the orchestrator)

State of that effort, measured: `git log --oneline -3 -- src/lib/canvas-network-failure.ts`
shows `8a5ec9e6` (its W1: leaf, `canvas-fetch.ts`, lookup fix). The files its W2
and W3 need do not exist yet: `ls src/lib/canvas-failure-report.ts` -> no such
file. So W2 and W3 are PENDING, and both touch files this scope also needs:

| Shared file | Connectivity | This scope | Resolution |
|---|---|---|---|
| `src/lib/session-diagnostic-log.ts` (+ its `.test.ts`) | W2 adds `cause`, `code`, `serverMs` fields and 3 CSV columns after Host (its section 4.6); W3 edits the `diagnostics` coverage sentence | WB adds `detail` and 1 CSV column | serialize: connectivity W2 first, then WB, because their AC-14 pins the header literally as ending `"Host","Cause","Code","Server (ms)"` and the row tail (their `:611,:612,:642,:673-676`). WB then appends `"Detail"` and edits those same tail assertions once. If WB landed first, their AC-14 text would be wrong |
| `gradingDiagnosticLog.ts` (+ test) | forwards the three fields | forwards `detail` | same serialization |
| `chatSeamDiagnostic.ts` (+ test, wiring test) | `recordChatSeamSettled` gains cause/code/serverMs | gains `detail` | same serialization; `classifyChatSeamFailure` and the 10 classes are NOT changed by either (their F6, this scope's `error` stays one of the 10) |
| `useLmsSubmissionPicker.ts` | edited | NOT touched | none |

Pre-dispatch check for WB (an instrument, not a judgement):
`git log --oneline -- src/lib/canvas-failure-report.ts` must be non-empty (W2
landed) OR the owner orders WB first and amends their AC-14. WA, WC (apart from
its dependency on WB's type), WD and WE are disjoint from all connectivity waves
(empty `uniq -d` in section 3). So the queue does not stall: WA starts now.

Vocabulary does not collide: their `cause` tokens are network causes
(`connect-timeout`, ...); this scope's `failure` tokens are grade causes. The two
are different keys in different columns. Their picker entries (`list_lms_*`)
carry no `detail`; none of their operations is in this scope's key tables.

---

## 9. Acceptance criteria (each: object / instrument / direction of failure)

All model, network and Storage behaviour is exercised through MOCKS (`callLlm`,
`dispatchItem`, `canvasFetch` never reached; `vitest.setup.ts` blocks `fetch`).
Fixtures must be built from the REAL builder outputs, not hand-typed shapes
(`fixtures-must-match-emitted-shape` memory).

WA
- AC-1 Typed failure at source, messages unchanged. OBJECT: the `ungraded.message`
  and the sink's `failure` produced by `gradeEntries` for eight model outcomes.
  INSTRUMENT: `engine.diagnostic.test.ts` with `callLlm` mocked per row and a
  FROZEN LITERAL table (status 400, 429, 404, 503, 0; ok with finishReason
  MAX_TOKENS; ok with finishReason SAFETY; ok with text `not json`) -> expected
  `(message, class)`. The class axes come from the table, not from the
  generator under test. PASS: every message equals the pre-change literal
  (`engine.ts:129,:137-139,:142`, `parsing.ts:295-323`) AND every class equals the
  table AND the eight classes are pairwise distinct where the table says so.
  FAILS IF: a message differs by one character, two causes collapse, or an
  outcome yields `unclassified`.
- AC-2 Usage and timing captured. OBJECT: sink contents after a successful grade.
  INSTRUMENT: same file; `callLlm` returns `{ ok: true, text: <valid grading
  JSON>, usage: { promptTokenCount: 1200, candidatesTokenCount: 340,
  totalTokenCount: 1540 }, elapsedMs: 2100, finishReason: "STOP" }`. PASS: one
  call with exactly those numbers; a two-axis discussion entry (fixture from
  `reply-axis-scoring.oracle.test.ts`'s setup, duplicated not imported) yields 2
  calls with summed tokens; a reply section with zero replies (the no-model-call
  path, `absentReplyAreas`, `engine.ts:228-234`) yields 1 call, not 2; `usage`
  absent in the mock -> token fields absent, not 0. FAILS IF: usage dropped,
  summed wrongly, or counted for a pass that made no call.
- AC-3 Route envelope. OBJECT: response bodies for 200, 504 (`timedout`), 502
  (`failed`), and the video-failure branch. INSTRUMENT: `route.diagnostic.test.ts`
  (mocks engine and `raceWithTimeout` exactly as `route.test.ts:172-183`). PASS:
  200 body `result` deep-equals the pre-change value and `diagnostic.serverMs`,
  `prepMs`, `gradeMs` are non-negative numbers and `model` is a token; error
  bodies keep `error` byte-identical and statuses unchanged, with
  `diagnostic.failure` = `route budget` (504) / `route error` (502); every
  `Object.keys(diagnostic)` is in `GRADE_ITEM_DIAGNOSTIC_KEYS`. `route.test.ts:252`
  is updated to admit the key and nothing else in that file changes. FAILS IF:
  `result` or `error` differs, a status moves, or an unlisted key appears.
- AC-4 No content in the server diagnostic. OBJECT: `JSON.stringify(diagnostic)`.
  INSTRUMENT: `route.diagnostic.test.ts` with canaries `ZZ_CANARY_STUDENT`
  (student), `ZZ_CANARY_BODY` (content), `ZZ_CANARY_FILE.pdf` (file name),
  `ZZ_CANARY_RUBRIC`, and a Gemini-400 body containing `ZZ_CANARY_GEMINI_DETAIL`
  driven through the REAL `normalizeGeminiError`. PASS: none appears. FAILS IF:
  any appears (for example a builder that copies `error.message`).
- AC-5 Existing video-seam and engine suites unchanged: the `Must also run` list
  passes with no assertion edited other than `route.test.ts:252`.

WB
- AC-6 Core backstop. OBJECT: the stored entry's `detail`. INSTRUMENT:
  `session-diagnostic-log.detail.test.ts`. PASS: a valid bag stores intact; a key
  `Bad Key` / `a-b` is dropped; a string `Ada Lovelace` and `x=1;y` are dropped; a
  number `Infinity` / `NaN` dropped, `12.7` stored as 13; 41 valid pairs store 40
  (sorted-key order); an all-invalid bag omits the `detail` key entirely
  (`Object.keys(entry)` has no `detail`); no `detail` argument -> key absent, not
  `undefined`. FAILS IF: any invalid pair is stored, or the key is present when
  empty.
- AC-7 Export and old-export compatibility. OBJECT: the CSV and JSON text, and
  `parseSessionDiagnosticLogEntries`. PASS: the CSV header ends with `"Detail"`
  and every entry row has the same cell count as the header (with and without
  `detail`); the cell is `k=v;k=v` sorted; JSON round-trips equal; a FROZEN
  LITERAL old export with no `detail` parses to entries lacking the key; a
  hand-edited export carrying `detail: { "A b": 1, "ok": "Ada Lovelace" }` parses
  with both pairs dropped. FAILS IF: header/row length differ, or the old export
  fails to parse.
- AC-8 Wrapper pass-through and the class list stays closed. OBJECT:
  `recordChatSeamSettled` / `recordGradingDiagnosticEntry` with `detail`. PASS:
  the stored `detail` equals the input; `error` is still a member of the existing
  list; `CHAT_SEAM_FAILURE_CLASSES.length === 10` is now ASSERTED (it is only
  `toContain` today, `chatSeamDiagnostic.test.ts:36`); `decideChatSeamDiagnostic`'s
  existing `toEqual` shape tests still pass (the key is omitted when absent).
  FAILS IF: the class list changes length or `detail` is dropped.
- AC-9 Coverage honesty. OBJECT: `COVERAGE_BY_SURFACE.grading` (`:98-99`) and the
  download's coverage block. PASS: the text names the new detail AND states what
  is excluded (names, file names, submission text, prompts, URLs), and the loop at
  `session-diagnostic-log.test.ts:439` still finds its six claimed phrases.
  FAILS IF: it claims detail without the exclusion sentence.

WC
- AC-10 Per-attempt `grade_item` detail, one entry per dispatch. OBJECT: the
  `grade_item` session entries after driving the hook (mock `dispatchItem`).
  INSTRUMENT: `useContinuousGradingRun.itemdiag.test.ts`. PASS: first graded row
  -> `item 1, attempt 1, trigger first`; a failed row -> same plus `failure`; its
  `retry` -> `attempt 2, trigger retry`; a `regrade` of a graded row ->
  `attempt 2, trigger regrade`; `waitMs` numeric >= 0; `1 <= inflight <= 3`; the
  count of `grade_item` entries equals the number of dispatches exactly. FAILS
  IF: a retry looks like a first attempt, or an extra entry is appended per row.
- AC-11 Result-derived signals. OBJECT: detail for a FROZEN fixture table:
  `{strengths:"", improvements:"x", commentSplit:true}` -> `hasPraise false`;
  `rubricAreas` 2 with 3 criteria -> `areas 2, areasExpected 3`;
  `submissionTruncated:true` -> `truncated true`; `linkFetch:"failed"` ->
  `link failed`; `codeExecution:{ran:false,neededStdin:true}` -> `code
  needs-input`. PASS: exact values. FAILS IF: any maps wrongly. Instrument for
  the pure mapping: `chatGradeDetail.test.ts`.
- AC-12 Server detail merged. OBJECT: detail when the injected `dispatchItem`
  fills the sink with a server diagnostic. PASS: `serverMs`, `gradeMs`, `modelMs`,
  `model`, `promptTokens`, `outputTokens`, `finishReason` are present and equal
  the sink; `netMs` equals `max(0, clientMs - serverMs)` (asserted on the pure
  leaf with explicit numbers, since the clock is `performance.now()`); absent
  sink -> no server keys. FAILS IF: a server field is dropped or `netMs` negative.
- AC-13 Failure paths stay classes, and PII canaries never reach the log. OBJECT:
  the entry for (a) `dispatchItem` rejecting `new Error("... ZZ_CANARY_ERR ...")`
  with `httpStatus 504`, (b) a result whose `ungraded.message` contains
  `ZZ_CANARY_MSG`, (c) a student label `ZZ_CANARY_STUDENT`, a file named
  `ZZ_CANARY_FILE.docx`, a storage path `ZZ_CANARY_UID/grading-uploads/x`.
  PASS: `entry.error` is a member of the existing 10 classes; `detail.failure` is
  a member of `GRADE_FAILURE_CLASSES`; `JSON.stringify(entries)` contains no
  canary. FAILS IF: any canary appears.
- AC-14 Intake gaps now recorded. OBJECT: entries for (a) a non-video zip ingest
  refusal, (b) a batch clipped by the cap, (c) the cap refusing outright, (d) a
  split confirm, (e) a zip success with a ledger. PASS: (a) a
  `prepare_submission` failure entry with `stage prepare` and a fixed `error`;
  (b)/(c) `admit_submissions` with exact `requested/admitted/clipped/cap`; (d)
  `resolve_recording_split` with `decision confirm`; (e) `found/emitted/skipped/
  failedFiles` equal the ledger lengths and the skipped student NAMES are absent.
  (a) is RED against HEAD - `:465-470` records nothing without `videoFailure` -
  which is the proof the instrument can fail. FAILS IF: names appear or a case
  records nothing.
- AC-15 Panel gate sites. OBJECT: `GradingChatPanel.tsx` source. INSTRUMENT:
  `GradingChatPanel.diagnostic.wiring.test.ts` (source-text; no render exists).
  PASS: the transport-refused (`:492`), preflight-refused (`:494`) and
  zip/single upload-failed branches (`:425`, `singleFileClient.ts:100`) each call the recorder with `stage`, and the
  pure gate describer in `chatGradeDetail.ts` returns the expected `transport`,
  `sizeKb`, `ext` for fixtures (`chooseZipTransport`/`chooseSingleFileTransport`
  outputs for a small body file, an over-budget zip, an over-limit zip). FAILS
  IF: a branch records nothing. A reading claim for the panel half.

WD
- AC-16 Reachability. OBJECT: `GradingChatPanel.tsx` and `ChatRunDiagnostics.tsx`
  source. INSTRUMENT: `ChatRunDiagnostics.wiring.test.ts`. PASS: the panel imports
  and renders `ChatRunDiagnostics` with `driver.diagnostics`; the component
  renders a `<details>` whose summary comes from `summarizeRunDiagnostics`; it
  reads no `localStorage` and imports no session-store function; and
  `SessionLogSection.tsx` calls `describeSessionDiagnosticDetail`. FAILS IF: any
  link is absent (the green-but-dead case).
- AC-17 Summary leaf. OBJECT: `summarizeRunDiagnostics(items)`. PASS on FROZEN
  fixtures: graded / failed counts, per-failure-class counts, slowest client
  time, total tokens, retried count; an empty list returns `null`. FAILS IF: a
  count differs.
- AC-18 Copy text has no names. OBJECT: `formatRunDiagnosticsText(items)`. PASS:
  contains `Row 1`, the fields, and NOT the label canary. FAILS IF: the label
  appears.
- AC-24 Diagnostics cannot change a grade. OBJECT: the arrived row after a graded
  dispatch when the detail builder is forced to throw (mock the leaf). PASS: the
  row stays graded, `completedCount` is right, no rejection escapes. FAILS IF:
  the row becomes `grading-failed` (finding 0.4).

WE
- AC-20 Intake refusals typed, text untouched. OBJECT: the refused outcome for ten
  representative refusals (no file, over wire budget, unsupported type, video
  pending, unreadable single file, no URL, empty Canvas URL, unreadable GitHub
  repo, Drive folder, unsupported URL). INSTRUMENT: `grading-chat-intake.refusal.test.ts`
  with targeted mocks (the `live-messaging-enrollments.test.ts` idiom). PASS:
  `refusalClass` equals a FROZEN table AND `reason` is byte-identical to the
  existing literal. FAILS IF: a class is missing/wrong or a `reason` changes.

All waves
- AC-21 Ceiling, bytes, emoji: `file-size-ceiling.structure.test.ts`,
  `source-bytes.structure.test.ts`, `no-emojis.test.ts` pass on the whole tree.
  FAILS IF: any file passes 1000 lines or gains a BOM/control byte/emoji.
- AC-22 Entry budget. OBJECT: total session entries after a simulated 40-row run
  of text submissions through the hook with a mock dispatch. PASS: exactly `1
  (resolve_header) + 40 (grade_item)` entries - no per-row additions on the
  all-admitted path. FAILS IF: more (the 500 cap, `:185`, then drops the header).
- AC-23 Diagnostics representation: this increment carries its own. The presentational
  panel carries none beyond reading the same data, stated here, not assumed.

---

## 10. Structure pins and sabotage (the instruments must be able to fail)

Pins (source-text, because no component renders):
- P1 `grade-failure.ts` and `grade-item-diagnostic.ts` contain no `import` line.
- P2 `route.ts` does not import `chatGradeDetail`, `gradingDiagnosticLog`,
  `chatSeamDiagnostic` or `session-diagnostic-log` (browser-only boundary).
- P3 `engine.ts` still contains the literal messages at `:129`-style sites
  (`"cut off or blocked before it finished"`, `"not valid grading JSON"`).
- P4 `chatGradeDetail.ts` builder signatures contain no `string`-typed parameter
  other than `model` (pin by reading the exported function parameter list).
- P5 the hook's diagnostic calls are wrapped in `safeDiagnostic(` and sit after
  `recordArrival(` in the `.then` body.
- P6 `ChatRunDiagnostics.tsx` contains no `localStorage` / `sessionStorage`.
- P7 `GradingResults.tsx` is unmodified by this scope (`git diff --stat` empty for
  it at each wave gate).

Sabotage the test seat must design (each mutation turns a named test red; apply by
`cp` backup, never `git checkout`, MEMORY sabotage-restore-needs-a-copy):
1. make `scoreAxis` throw a plain `Error` -> AC-1 red (removal test).
2. stop reading `result.usage` -> AC-2 red.
3. copy `describeError(err)` into the route diagnostic -> AC-4 red.
4. remove the core key/value validation -> AC-6 red.
5. add `entry.student` to the detail builder -> AC-13 red.
6. hard-code `trigger: "first"` -> AC-10 red.
7. drop the `admit_submissions` record on clip -> AC-14 red.
8. append the CSV header column without the row cell -> AC-7 red.
9. remove the panel mount -> AC-16 red.
10. record a second entry per grade -> AC-22 red.
11. put the label into `formatRunDiagnosticsText` -> AC-18 red.
12. remove `safeDiagnostic` and make the builder throw -> AC-24 red.

---

## 11. Residual register (owner / instrument / measuring step)

| ID | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | No per-row "why" inside the results table; `GradingResults.tsx` is 997 lines and shared by four mounts | whoever next edits `GradingResults.tsx` | `@(Get-Content src/app/components/GradingResults.tsx).Count` must drop to about 940 via an extraction before any row affordance lands | a follow-up row; measured at that wave's gate |
| R2 | LLM-internal retry count not surfaced (`llm.ts:403`); only `overheadMs` hint | owner of `llm.ts` | an optional `attempts` on the SUCCESS branch of `LlmResult`, pinned in `llm.usage.test.ts`; not on the failure branch (`llm.test.ts:629,:646,:852` assert the exact failure shape) | a follow-up row after WA ships and the owner reads real `overheadMs` |
| R3 | Gemini finish-reason semantics recalled, not verified (no network): the design only separates MAX_TOKENS from "other non-STOP" | repo owner | the first real export containing a non-STOP `finishReason` token | after WA/WC ship, owner reads one export |
| R4 | Real token, latency and model values unverifiable here (no API key, no network) | repo owner | one real graded run's downloaded log: `promptTokens`, `modelMs`, `model` present and plausible | first owner run after WC |
| R5 | A platform kill at the 60 s cap returns no body, so `transport lost` cannot be proven distinct from a network drop | repo owner | export row with `failure transport-lost`, no `serverMs`, client duration near 60 s | first occurrence in production |
| R6 | `useOneUploadRun.ts:180-190` records raw `errorMessage`; whole-run and one-upload surfaces get no `detail` | next grading-diagnostics increment | `grep -n "error: errorMessage" src/app/components/grading/useOneUploadRun.ts` returns nothing | a follow-up row; the session-log `error` field for that surface should be converted to a class |
| R7 | Tension with "one store, never two" (fork F3) | owner decision, with the checker's finding | AC-10's one-to-one parity between items and exported entries | the check round on this document; owner redirects in one message |
| R8 | Serialization with connectivity W2/W3 on four shared files | orchestrator | `git log --oneline -- src/lib/canvas-failure-report.ts` non-empty before WB dispatch | the WB dispatch step |
| R9 | `post_grades` / `post_draft` from the chat page are not enriched | next grading-diagnostics increment | `grep -rn "post_grades" src/app/components --include=*.ts --include=*.tsx` call sites | follow-up row |
| R10 | The 500-entry cap still drops the OLDEST entries (run header first) in a long session | repo owner | `droppedCount` in the download's Session block (`:422`) greater than 0 after a long run | first long session; the panel is unaffected because it is hook-local |
| R11 | No component renders: panel layout, dark theme of the reused classes, keyboard/ARIA are reading claims | owner (open the page once) and the accessibility seat | owner opens the chat grading view with a few rows, expands the panel in light and dark | after WD |
| R12 | `netMs` mixes transit, platform cold start and edge queueing | repo owner | compare `netMs` across rows; a spread of seconds on otherwise equal rows indicates cold start | after real data exists |

---

## 12. What could not be determined here (state, do not fill in)

- Any real model output, token count, latency or retry behaviour (no `.env`, no
  network, `docs/loop/this-repo.md` section 6).
- The exact entry count of a real 40-row run (derived by reading only).
- How the panel looks in either theme, or its keyboard behaviour (no component
  is rendered by any test).
- Gemini's `finishReason` enum semantics (recalled, not read from a source here).
- Whether Vercel's runtime or platform adds latency visible in `netMs`.
- The full set of intake refusal sites' final grouping into classes (WE's table
  is the seat's to construct; I counted ~27 returns by reading
  `grading-chat-intake.ts:178-365` and did not verify the count mechanically).

---

## 13. For the orchestrator

Proposed backlog row (the orchestrator files it; I did not touch the file):
area "What it costs an instructor to get from rubric to graded, measured against
a chat window" or the fitting grading-diagnostics area; id
CHAT-GRADING-DETAILED-DIAGNOSTICS; `from`: this document plus the commit that
adds it; owns: the production files of WA..WE in section 7; instruments:
section 9; owner-only residuals: R4, R5, R11.

Dispatch note under the "never stall" rule: WA (disjoint from everything in
flight) is startable immediately and does not wait on the connectivity effort or
on any owner answer. The only owner-shaped items are R7 (one-store tension) and
R11; both ride alongside.

Recommended readings acted on (owner redirects cost one message): F1 both
surfaces, F2 one `detail` bag, F3 hook-local panel data, F4 typed at source, F5
labels on page only, F6 derive retries, F7 enrich not add, F8 WA now / WB after
connectivity W2, F9 no persisted open state.
