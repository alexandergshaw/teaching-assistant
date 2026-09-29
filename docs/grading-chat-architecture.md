# Architecture + reuse: the Grading chat surface (GRADING-CHAT, wave 1)

Seat: Architect + reuse survey (`loop-architect`), wave 1 of the design phase. A
fresh `loop-checker` reads this before the plan/test/UX seats consume it. This
document decides SHAPE: the driver (R1), the ingestion taxonomy (R3 recommended
reading), the total-count bound (R4), the mount, and the storage model. It does
NOT write code, oracles, or the final test bodies.

Consumes `docs/grading-chat-acceptance-criteria.md` (AC-1..17, AC-L) and its
clean check `docs/grading-chat-acceptance-criteria-check.md`. Every citation
below was opened at the line cited, on HEAD `8205c2b9` (`git rev-parse --short
HEAD`).

## 0. Instruments - every quantity names its command

| Quantity | Instrument |
|---|---|
| Line count A | `wc -l < <path>` (Bash tool, Git Bash) |
| Line count B | `@(Get-Content <path>).Count` (PowerShell tool) |
| Symbol occurrence, decl/call/ref split | `src/tools/symbol-count/count.ts` `countSymbolOccurrences` (never `grep -c`, which counts prose lines; never `grep -P`, which exits 0 here without checking) |
| String-literal / id collision | `grep -rn '"<id>"' src --include=*.ts --include=*.tsx` |
| Source-text readers of a file | `grep -rln "<basename>" src --include=*.test.ts`, each opened |
| Cited-line reads | `Read` at the cited line, on `8205c2b9` |
| Docs gate | `npm run docs:gate` |

**Both counters, on `8205c2b9`, for every file this design touches or reuses**
(`wc -l` and `@(Get-Content).Count` agree on all):

| Path | `wc -l` | `@(Get-Content).Count` | Role |
|---|---|---|---|
| `src/app/page.tsx` | 804 | 804 | WRITTEN (grows ~20) |
| `src/app/components/manual/manual-rail.ts` | 360 | 360 | WRITTEN (grows ~6) |
| `src/app/components/manual/manual-rail.test.ts` | 558 | 558 | WRITTEN (canary updates) |
| `src/app/components/tabs/topLevelTabs.wiring.test.ts` | 634 | 634 | WRITTEN (new instrument) |
| `src/app/components/grading/useIncrementalGradingRun.ts` | 299 | 299 | REUSE (model), NOT written |
| `src/app/components/grading/incrementalRunPlan.ts` | 299 | 299 | REUSE (import), NOT written |
| `src/app/actions/grading-incremental.ts` | 230 | 230 | REUSE (model), NOT written |
| `src/lib/grade/single-file-entry.ts` | 133 | 133 | REUSE (import), NOT written |
| `src/lib/grade/repo-content.ts` | 134 | 134 | REUSE (import), NOT written |
| `src/lib/grade/run-header.ts` | 60 | 60 | REUSE (import), NOT written |
| `src/app/api/grade-run-item/route.ts` | 192 | 192 | REUSE (POST target), NOT written |

**Reasoning-from-reading vs measured.** [MEASURED] names the command that
produced it. [READING] is traced from source and cannot be verified here
because **no component is rendered by any test in this repo** (`vitest` is
node-env, collects only `src/**/*.test.ts`, `vitest.setup.ts` throws on real
`fetch`, `docs/loop/this-repo.md:110-118`). Every claim about layout, focus,
clipboard, reload, or what the instructor sees is [READING] and goes to the
owner walk (section 12) with no proxy proposed.

**Collision checks [MEASURED]:** `grep -rn '"grading-chat"|gradingView === "chat"|GradingChat' src`
returns **0** files; `grep -rn 'ta-grading-chat' src` returns **0**. The new
destination id, the new `GradingView` member, the component name, and the
`ta-` key namespace are all free.

**Git status at the start of this pass [MEASURED, `git status --short`]:** six
files modified by a concurrent N13a floor-removal agent
(`src/app/components/drafted-grades/ClassTrendsDraftPanel.tsx`,
`.../classTrendsDraft.wiring.test.ts`, `.../classTrendsDraftState.test.ts`,
`.../classTrendsDraftState.ts`, `src/lib/grade/class-trends-draft.test.ts`,
`src/lib/grade/class-trends-draft.ts`). **None is in this design's write set.**
This pass wrote only this one document.

---

## 1. What this surface is, and the one shape decision that governs everything

A SIXTH `GradingView` member (`"chat"`), a genuinely distinct surface with its
own destination in the Grading group and its own always-mounted host, following
the wave-2/wave-3 GRAD-SUBTAB pattern exactly. It is NOT a fill of the `run`
surface (AC section 0).

**The single governing fact, and the reason R1/R3/R4 are one problem, not
three:** the batch grading path fuses two responsibilities into one server
action. `prepareGradingRunAction` (`grading-incremental.ts:79`) does, in one
call over one `FormData`:

- **(a) per-RUN header resolution** - blank-instructions refusal, effective
  rubric, `criteriaNames`, provenance - via `resolveRunHeader`
  (`run-header.ts:32`), done ONCE (`grading-incremental.ts:159`);
- **(b) per-INPUT extraction** - one zip / one Canvas URL / one single file ->
  `StudentSubmissionEntry[]` - via `extractStudentEntries` /
  `extractCanvasEntries` / `buildSingleFileEntry`
  (`grading-incremental.ts:122-134`), building a FIXED ticket list
  (`grading-incremental.ts:170`).

The chat surface needs (a) exactly ONCE (instructions + rubric are set once and
remembered, AC-17) and (b) PER SUBMISSION EVENT, continuously, each expanding to
one-or-more entries that each dispatch a grade the instant they arrive (AC-5,
AC-6, AC-L). So the architecture SPLITS the fused action into two independently
callable server actions and drives them from a new continuous client pool. That
split is the spine everything else hangs on.

---

## 2. R1 - THE DRIVER: a new sibling, `useContinuousGradingRun`. NOT an extension.

**Decision: author a new client hook `useContinuousGradingRun`, reusing the
pure plan leaf (`incrementalRunPlan.ts`) and the per-item Route Handler
(`/api/grade-run-item`), rather than extending `useIncrementalGradingRun`.**

### 2.1 Why extension is the wrong shape (traced against the batch pool)

`useIncrementalGradingRun` (`useIncrementalGradingRun.ts:89`) is batch-shaped in
its bones, not just its entry point [MEASURED, read in full]:

- `startReview(fd)` takes ONE `FormData`, calls `prepareGradingRunAction` ONCE
  (`:246`), then `runPool` over a FIXED `requests` array
  (`buildRunItemRequests(plan)`, `:270-271`).
- `runPool` is a fixed-total drain: `INCREMENTAL_CONCURRENCY` workers share a
  `cursor`, each worker returns when `index >= requests.length`
  (`:186-189`), and `Promise.all` over the workers RESOLVES the run
  (`:208-217`). Completion is defined as "cursor exhausted the known array."
- `incrementalTotal` is set ONCE from `plan.tickets.length` (`:269`); the phase
  machine's terminal states (`complete`/`stopped`) are computed against that
  known total (`:214`, `arrivedRef.current.length === requests.length`).
- `selectRunKey`/`runIdRef` (`:107-108`, `:292-293`) pin ONE run identity per
  `startReview`; RULINGS 131/132 (dense re-projection on terminal, first-seen
  columns while running) are all written against a run whose ticket set is
  fully known at start.

A continuous surface has NO known total: submissions keep arriving. Retrofitting
"append after start" would require a mutable growing `requests` array, workers
that do not terminate on cursor exhaustion but idle awaiting more work, a
`total` that grows, and a `complete` phase that either never fires or fires
spuriously per idle. That distorts every invariant above and forks the hook into
two modes - and the batch hook is still needed (it is wired into `GradingTab`'s
whole-run/incremental-fill path; `submitWholeRun` injection, `:48-49`; five
`INCREMENTAL_ROUTE_ENABLED = false` interactions). Two modes in one hook means
its lifecycle test (`useIncrementalGradingRun.lifecycle.test.ts`, the no-render
`vi.mock("react")` harness, `:12-18`) must assert two contradictory shapes.

### 2.2 What the sibling reuses (maximal reuse of the tested, pure machinery)

The sibling reuses everything in `incrementalRunPlan.ts` that is NOT tied to the
fixed-ticket assumption - the row projection and column logic are keyed on
`sourceIndex`, which is exactly what makes them append-safe:

- `mergeArrivedResults(totalTicketCount, arrived)` (`:172`) - keyed by
  `sourceIndex`, sorted ascending, last-wins; **"a row never moves, it only
  appears"** (RULING 30). This is append-safe by construction: appending a
  higher `sourceIndex` never reorders lower ones (AC-7). The
  `totalTicketCount` parameter is NOT a filter bound (`:165-170` F22), so a
  continuous, ever-growing count is fine - pass the running dispatched count.
- `classifyItemFailure(sourceIndex, entry, error)` (`:198`) - one item's
  transport failure becomes an ordinary `grading-failed` row, isolated (AC-5).
- `canonicalColumns(header, arrived, rows, phase)` (`:237`) - frozen
  `criteriaNames` when present (they are, once the header resolves), so columns
  are stable across students (AC-12).
- `buildIncrementalRun(params)` (`:260`) - assembles the ONE `GradingRun` the
  results table renders, recomputed from raw arrived rows every call (F21).
- `GradeRunItemRequestBody` (`:57-65`), `ArrivedItemResult` (`:67-70`),
  `INCREMENTAL_CONCURRENCY` (`:31`), `estimateEntryWireBytes` (`:80`),
  `ITEM_REQUEST_BYTE_BUDGET` (`:42`).
- The transport `postGradeRunItem` shape (`useIncrementalGradingRun.ts:76-87`)
  and the per-item `.catch` isolation idiom (`:192-200`) are copied, not
  imported (they are file-private to the batch hook).

**The pool model changes from fixed-drain to a bounded in-flight counter.**
Instead of N workers draining a fixed cursor, the continuous driver keeps an
`inFlight` count and a growing `queue`; each arriving submission's entries are
appended to `queue`, and a `pump()` dispatches from the head while
`inFlight < INCREMENTAL_CONCURRENCY`. When a dispatch settles, `pump()` runs
again. This is the standard "dispatch-on-arrival under a simultaneity cap" and
is what AC-L measures.

### 2.3 Relationship to `INCREMENTAL_ROUTE_ENABLED` (stated, per the brief)

`INCREMENTAL_ROUTE_ENABLED = false` (`incrementalRunPlan.ts:104`) gates ONE
thing and one thing only: `routeGradingRun` (`:125-142`), the pure decision of
whether the BATCH `GradingTab` form pools via the incremental route or falls
back to the whole-run action (RULING 116). This surface **does not call
`routeGradingRun` and is not governed by that flag.** The flag exists because
the incremental route was "a thinner surface than whole-run" for the BATCH form
- no `RubricProvenance` mount, no blank-rubric handling, no blank-instructions
refusal on that path (`:89-99`). This surface addresses every one of those gaps
directly: it resolves the run header (which IS the blank-instructions refusal and
the blank-rubric rule, section 4/R2) and it is a NEW surface, not a default
substitution of an existing one - so the concern the flag guards does not arise
here. **The chat surface reaches `/api/grade-run-item` unconditionally, through
its own driver; it neither reads nor flips `INCREMENTAL_ROUTE_ENABLED`.** [READING,
traced: the sibling driver imports the pure leaf's projection/failure/column
helpers but not `routeGradingRun`.] This is deliberately called out because a
later reader could assume any per-item dispatch is gated by that flag; it is not.

### 2.4 The seam - exact signatures

```ts
// src/app/components/grading-chat/useContinuousGradingRun.ts  (NEW, "use client")
export interface UseContinuousGradingRunParams {
  provider: LlmProvider;
  // Injected so the hook is driven by the no-render lifecycle harness with a
  // MOCKED seam (AC-L), exactly as useIncrementalGradingRun injects
  // submitWholeRun. Default in the panel is the real postGradeRunItem.
  dispatchItem?: (request: GradeRunItemRequestBody) => Promise<GradeResult>;
  // The per-session entry ceiling (R4). Default getGeminiMaxSubmissions().
  maxEntries?: number;
}

export interface UseContinuousGradingRunResult {
  // Resolve the per-run header ONCE. Refuses on blank instructions (AC-3).
  // Idempotent: a second call with the same inputs is a no-op while a header
  // is already resolved for this session.
  beginSession: (params: { assignmentInstructions: string; rubric: string }) => Promise<
    { kind: "ready" } | { kind: "refused"; reason: string }
  >;
  // Accept ONE submission event; expands to entries server-side (or client for
  // text), assigns sourceIndex from a monotonic counter, enqueues each entry.
  // Returns before grading completes (non-blocking, AC-6). A refusal (unsupported
  // file, collision zip, over the ceiling, arbitrary URL) is surfaced, no row.
  submit: (input: ChatSubmissionInput) => Promise<
    { kind: "accepted"; entryCount: number } | { kind: "refused"; reason: string }
  >;
  reset: () => void;                      // clears the session (new assignment)
  headerState: "unset" | "resolving" | "ready" | "refused";
  results: readonly GradeResult[];        // mergeArrivedResults projection
  run: GradingRun | null;                 // buildIncrementalRun output for the table
  dispatchedCount: number;                // total entries enqueued (against maxEntries)
  completedCount: number;                 // arrived (graded or failed)
  inFlight: number;
  sessionError: string | null;
}
```

`GradeRunItemRequestBody`, `GradeResult`, `GradingRun`, `LlmProvider` are the
existing types. `ChatSubmissionInput` is the taxonomy (section 3).

---

## 3. R3 (recommended reading) - THE INGESTION-FORMAT TAXONOMY

The AC confirmed there is NO single ingestion-format enum today
(`GradingSubmissionKind`, `submission-kind.ts:29`, is a discussion-contribution
classification - do-not-reuse, section 6). The four format paths exist but
unjoined. This section designs the unifying taxonomy and states how EACH kind
becomes the same `StudentSubmissionEntry[]` the engine grades.

### 3.1 The discriminated input type (the seam the panel emits)

```ts
// src/app/components/grading-chat/chatSubmissionIntake.ts  (NEW, pure leaf - see 3.4)
export type ChatSubmissionInput =
  | { kind: "text"; label?: string; content: string }
  | { kind: "file"; file: File }   // single OR zip; disambiguated server-side
  | { kind: "url"; url: string };  // Canvas or GitHub today; arbitrary refused (R3)
```

Three members map to the owner's "text submissions, zip submissions, url
submissions, other file submissions": `text`, `url`, and `file` (a single
supported file OR a zip - the owner's "zip" and "other file" both arrive as a
dropped/picked `File` and are separated server-side by extension, exactly as
`classifyGradingUpload` already does, so the composer needs ONE file control,
not two). This is the minimal-clicks reading (memory: minimize clicks).

### 3.2 The intake outcome (what every kind resolves to)

```ts
export type IntakeOutcome =
  | { kind: "entries"; entries: StudentSubmissionEntry[] }
  | { kind: "refused"; reason: string };
```

Every kind resolves to `StudentSubmissionEntry[]` (0..N) or a NAMED refusal.
This is the join point R3 asks for: text (1 entry), single file (1), zip (N),
Canvas URL (N), GitHub repo URL (1) all become the same array the driver
assigns `sourceIndex`es to and dispatches.

### 3.3 Per-kind resolution, with the exact reused extractor

| Input kind | Becomes | Extractor (reuse) | Notes |
|---|---|---|---|
| `text` | 1 entry: `{ student: label ?? "Submission N", content, mergedFileCount: 0, submittedFiles: [] }` | none (client-buildable) | `route.ts:91` accepts `entry.content` directly; `route.ts:88` requires `student` non-empty -> the label defaulter (3.5) guarantees it. This is the ONE kind buildable without a server round trip (3.4). |
| `file` -> single | 1 entry | `buildSingleFileEntry(name, Buffer)` (`single-file-entry.ts:72`) | server-only (needs `Buffer` + `extractTextFromBuffer`); `.docx`-as-zip hazard already handled by extension-only `classifyGradingUpload` (`:36-45`). |
| `file` -> zip | N entries | `extractStudentEntries(arrayBuffer, { inferFileNamesWith: provider })` (imported at `grading-incremental.ts:28`) | server-only; A44 collision refusal (`decideCollisionRefusal`, thrown from inside `extractStudentEntries`, `collisionRefusal.ts` per A46) fires here, BEFORE any entry is returned (AC-9). |
| `file` -> unsupported | refusal | `classifyGradingUpload(name) === "unsupported"` (`single-file-entry.ts:36`) | named reason, not graded-as-empty (AC-8 direction). |
| `url` -> Canvas | N entries | `extractCanvasEntries(canvasUrl)` (imported at `grading-incremental.ts:28`) | server-only; whole-class ingest (like a zip). `detectCanvasUrlKind` (used at `GradingTab.tsx:136`) classifies Canvas URLs. |
| `url` -> GitHub repo | 1 entry | `fetchGradableRepoContent(url)` (`repo-content.ts:55`) + `parseSubmissionGithubUrl` (`submission-repo.ts`) | server-only; primitive EXISTS and never throws (`repo-content.ts:48-54` returns `{error}`). A THIN new mapper builds the entry (3.6). |
| `url` -> anything else | refusal | `parseSubmissionGithubUrl` errors AND not a Canvas URL | "This surface accepts Canvas assignment/discussion URLs and GitHub repo URLs. Arbitrary web URLs are not supported yet." Arbitrary-URL fetch is the OWNER-GATED layer (section 11, R3-fork). AC-10 direction: no misleading "accepts URLs" claim. |

### 3.4 Where extraction runs - the server intake action

All kinds EXCEPT `text` require server-only extractors (`Buffer`,
`office-extract`, `lib/github`, Canvas fetch). So the taxonomy's runtime home is
a NEW server action; the pure leaf holds only the types and the text builder:

```ts
// src/app/actions/grading-chat-intake.ts   (NEW, "use server")
export async function prepareChatSubmissionAction(formData: FormData): Promise<IntakeOutcome>;
export async function resolveChatRunHeaderAction(
  assignmentInstructions: string,
  rubric: string,
  provider: LlmProvider,
): Promise<GradingRunHeader>;
```

- `prepareChatSubmissionAction` receives ONE submission as `FormData` (a `kind`
  discriminator plus `file` / `url` / `content` / `label` / `provider`),
  classifies it, calls the matching extractor above, runs the per-entry wire
  budget check (`estimateEntryWireBytes > ITEM_REQUEST_BYTE_BUDGET` ->
  `refused`, reusing `grading-incremental.ts:148-152`'s check but returning a
  refusal rather than a whole-run fallback - there is no whole-run path here),
  and returns `entries` or a named `refused`.
- `resolveChatRunHeaderAction` is a thin wrapper over `resolveRunHeader`
  (`run-header.ts:32`) - the ONLY new server obligation for the header. It
  cannot be `prepareGradingRunAction` (that action is coupled to extraction and
  a file/canvasUrl). See section 4/R2 for `synthesizeRubricWhenBlank`.

Both actions call `requireAppOwner()` (matching `prepareGradingRunAction`,
`grading-incremental.ts:80`). Both are `async` (satisfies
`use-server-exports.test.ts`). Both are "use server" files, so `next build` is a
required gate for this wave (section 9).

**`text` is buildable client-side** (`chatSubmissionIntake.ts`'s pure
`buildTextEntry`), so the driver MAY skip the server round trip for text and
dispatch immediately - the lowest-latency path for the most common paste. The
recommended design routes text through the SAME `prepareChatSubmissionAction` for
ONE validation/refusal seam and one wire-budget check; the client fast-path is a
UX/reliability micro-optimization (RES-GC-3), not a shape decision. Either way,
`buildTextEntry` is the shared pure builder both sides call, so text produces a
byte-identical entry on either path.

### 3.5 The student label (route validation depends on it)

`route.ts:88` rejects an entry with an empty `student`. Text has no intrinsic
name. `buildTextEntry(input, ordinal)` defaults the label to `input.label?.trim()
|| "Submission ${ordinal}"`, where `ordinal` is the driver's monotonic
per-session counter. This guarantees a non-empty, distinct label so the route
never 400s a valid text paste, and A44/A45 identity invariants stay green (each
row keyed on its own `sourceIndex`, AC-7). The composer MAY expose an optional
label field (UX seat, RES-GC-2); the default makes the wave dispatchable without
it.

### 3.6 The one thin NEW piece for GitHub-repo URLs

`fetchGradableRepoContent` returns `{ repo, ref, content, files, ... }`
(`repo-content.ts:28-44`), not a `StudentSubmissionEntry`. A ~25-line mapper
`buildRepoUrlEntry` (in `grading-chat-intake.ts`) calls it and maps
`GradableRepoContent` -> `StudentSubmissionEntry` (`content` = the flattened
blob, `submittedFiles` from `files` mapped to `SubmittedFileInfo`,
`student` = the repo's `owner/repo`, `gradedRepo`/`gradedRef` from the result).
This is new ORCHESTRATION over an existing, tested primitive - the exact
precedent `repo-content.ts:11-16` states for itself ("the orchestration here is
new because the output shape is different ... but every network/parsing
primitive it calls already existed"). Canvas needs no such mapper -
`extractCanvasEntries` already returns entries.

---

## 4. R2 (recommended reading) - BLANK RUBRIC: reuse existing behaviour

**Recommended: reuse the existing run-header behaviour - synthesize a rubric
from the instructions when the rubric panel is blank, with the blank-instructions
refusal preserved.** This is the zip path's behaviour
(`grading-incremental.ts:159-161` passes `synthesizeRubricWhenBlank: !canvasUrl`,
i.e. TRUE for the non-Canvas path), which is the right analogue: the chat rubric
panel is a paste-text panel, like the zip flow.

Mechanism (all reuse):

- AC-3 blank-instructions refusal: `resolveRunHeader` returns
  `{ kind: "refused", error: "Please provide assignment instructions." }`
  (`run-header.ts:38-40`) - byte-identical to `grading-incremental.ts:91-92`.
  `beginSession` surfaces `header.error` and dispatches NOTHING (AC-3 direction).
- AC-4 blank-rubric: `resolveChatRunHeaderAction(instr, rubric, provider)` calls
  `resolveRunHeader(instr, rubric, provider, { synthesizeRubricWhenBlank: true })`.
  With a blank rubric this synthesizes one from the instructions
  (`run-header.ts:42-47`), so `criteriaNames` (the columns, AC-12) are non-empty
  and the effective rubric grades every student against the same synthesized
  rubric.

**Where an owner "refuse" or "no-rubric" ruling slots in, ISOLATED (one flag /
one guard, no redesign):** `synthesizeRubricWhenBlank` is a single boolean
argument to `resolveChatRunHeaderAction`. An owner ruling of:
- **"synthesize" (recommended)** -> pass `true` (as above);
- **"no rubric"** -> pass `false` (grades against the empty rubric, the gated
  incremental route's own behaviour, `incrementalRunPlan.ts:90-99`);
- **"refuse a blank rubric"** -> add a pre-check in `beginSession` mirroring the
  blank-instructions refusal (one `if (!rubric.trim()) return refused` before the
  action call).

All three flip one boolean or add one guard in `beginSession`/the header action;
none touches the driver, the taxonomy, the mount, or the table. Stated
prominently: **this pass builds `synthesizeRubricWhenBlank: true`.**

---

## 5. R4 - THE TOTAL-COUNT BOUND (architect decision, reliability co-owns knobs)

### 5.1 The client-driven per-item model, confirmed from the route

Confirmed against `route.ts` [MEASURED, read in full]: `/api/grade-run-item`'s
`POST` (`:127`) grades a ONE-element array `gradeEntries([entry], ...)`
(`:173`); it is guarded by `requireUser()` (`:133`); it declares
`maxDuration = 60` (`:26`) and a SOFT `TOTAL_BUDGET_MS = 50_000` (`:38`) that
bounds THIS ONE request, stopping itself before the platform kills the function
(`:160-164`). **Each submission the chat surface dispatches is its own HTTP
request, with its own auth, its own 50s soft budget, and its own function
invocation.** There is NO single 60s server invocation spanning the session -
unlike the cron/whole-run path, where `gradeStudentEntries` loops all students
inside ONE server action bounded by `maxDuration` and the `.slice(0, 40)` cap
(`engine.ts:204`, per the AC's measurement).

### 5.2 Why the 40-cap does not bound this surface (confirmed)

`DEFAULT_MAX_SUBMISSIONS = 40` (`gemini.ts:32`) is applied ONLY via
`.slice(0, maxSubmissions)` inside `gradeStudentEntries` (`engine.ts:204`). The
per-item route grades `gradeEntries([entry])` - a one-element array - so
`slice(0, 40)` over one element is a no-op. A continuous per-item session
inherits NO total ceiling. [MEASURED by the AC and re-confirmed here reading
`route.ts:173` and `engine.ts:204`.]

### 5.3 Decision: YES, a per-session ceiling, as a VISIBLE refusal, reusing the
existing value; do NOT port the wall-clock deadline

- **A ceiling is warranted.** Three reasons: (1) **cost** - each entry is a real
  model call; a runaway session (a mis-dropped 200-file zip, or a Canvas URL
  expanding to a huge class) spends real money with no server bound; (2)
  **rate-limit pressure** - the pool caps SIMULTANEITY at
  `INCREMENTAL_CONCURRENCY = 3`, not TOTAL, and the batch path's deliberate
  `DEFAULT_INTER_REQUEST_DELAY_MS = 1200` sleep (`gemini.ts:67`) lives INSIDE
  `gradeStudentEntries`, which the per-item route does NOT traverse for pacing
  (it grades one element), so client-driven dispatch can hit the model faster
  than the batch path ever did; (3) there is no server bound at all (5.1).
- **The value: reuse `getGeminiMaxSubmissions()` (default 40, `gemini.ts:129`)
  as `maxEntries`.** One knob, not a second threshold that disagrees with the
  batch cap - the exact "two thresholds nobody sees until a real input lands
  between them" class the code comments already warn against
  (`incrementalRunPlan.ts:38-41`). The bound counts ENTRIES (post-expansion),
  not submission events, because a zip/Canvas URL is one event but many entries.
- **The behaviour is a VISIBLE REFUSAL, never a silent slice** (AC-11
  direction). When accepting a submission would carry `dispatchedCount` past
  `maxEntries`, `submit` returns `{ kind: "refused", reason: "This session has
  reached its <N>-submission limit. Start a new session to grade more." }` and
  dispatches nothing. It reuses the VALUE of `DEFAULT_MAX_SUBMISSIONS`, NOT the
  `.slice` truncation.
- **Do NOT port the cron wall-clock deadline.** The `not-attempted` /
  `stoppedBy: "run-deadline"` outcome (`types.ts:142`) exists because the cron
  path runs all students inside ONE bounded server invocation and must stop
  before the platform kills it. This surface has no such single invocation - each
  submission is its own request with its own 50s budget. A session-level
  wall-clock deadline would be meaningless here and a wrong port; the per-request
  50s budget (`route.ts:38`) already handles the only real timeout, per item.

### 5.4 What reliability (wave 2) co-owns, flagged not decided here

- Whether the client should add an inter-request delay to mirror the batch
  path's rate-limit courtesy, given the per-item route does no pacing (RES-GC-4).
- The interaction of `INCREMENTAL_CONCURRENCY = 3` with the model's real
  rate limit under sustained continuous dispatch.
- Whether `maxEntries = 40` is the right DEFAULT for a large class, or whether
  the owner wants it higher (RES-GC-5, owner input; NOT a blocker - the wave
  ships at 40 and the number is one argument).

---

## 6. THE VETTED REUSE LIST (this seat's named deliverable)

Every entry opened at the cited line on `8205c2b9`. Fit note + caveat per entry.

| Symbol | `file:line` | What it gives this feature | Caveat |
|---|---|---|---|
| `GradingView` union + `GRADING_VIEW_PRESENCE` + `GRADING_VIEWS` | `manual-rail.ts:38,40-47` | The 5-member inner-nav union to extend to 6; `GRADING_VIEWS` is derived from the presence map, so adding a key auto-covers the derived guard | tsc forces the presence-map key |
| `destinations` "Grading" group | `manual-rail.ts:114-122` | Where the 6th destination (`grading-chat`) is added | CANARY: `manual-rail.test.ts:238,377` freeze the exact id/label list |
| `resolveStateFromDestinationId` gradingView IIFE | `manual-rail.ts:328-335` | Add `if (id === "grading-chat") return "chat";` | GUARD (derived) at `manual-rail.test.ts:323-337` forces this branch |
| `getActiveDestinationId` | `manual-rail.ts:238-239` | Generic `` `grading-${gradingView}` `` - NO edit needed | round-trips the new member automatically |
| `getInnerNavAriaLabel` / `INNER_NAV` | `manual-rail.ts:187-191,215-218` | "Grading tools" accessible name - NOT regressed (no edit) | adding a destination to the group does not change the group's `ariaLabel` |
| `StudentSubmissionEntry` | `types.ts:424-446` | The one entry shape every extractor and the route agree on | the join type of the whole taxonomy |
| `GradeResult` / `GradeResultBase` (`strengths`, `improvements`, `resubmitNotice`, `rubricAreas`, `totalScore`) | `types.ts:212-295` | The owner's "did right / did wrong / scores" - do NOT invent a parallel shape (AC-12, AC-13) | `GradedResult`/`UngradedResult` discriminated union (`:277-295`); never construct both `userId` and `ungraded` |
| `composeOverallComment` | `types.ts:28-37` | The one composer so `overallComment` never drifts from the three boxes | every producer must use it |
| `RESUBMIT_NOTICE` | `types.ts:15-16` | Verbatim resubmit notice (AC-14) | present iff points deducted; never model-generated |
| `RowFeedbackBoxes` + `namePrefix` | `RowFeedbackBoxes.tsx:85-157,59-72` | The copyable split-comment rendering the owner asks for ALREADY EXISTS, with per-box/per-student accessible names (`:119-127`); `namePrefix` lets ONE component serve this surface | likely reusable without a fork; the copy affordance itself is owner-walk (no render) |
| `GradingResults` table (via `buildIncrementalRun` -> `GradingRun`) | `incrementalRunPlan.ts:260` producing `GradingRun` (`types.ts:347`) | The results table the incremental run already renders; the chat run is the same `GradingRun` shape | the table component is reached the same way the incremental run reaches it |
| `/api/grade-run-item` POST | `route.ts:127,173` | THE per-submission grading primitive - one entry in, one `GradeResult` out (AC-5) | `requireUser()` (`:133`) vs `prepareGradingRunAction`'s `requireAppOwner()` - guard asymmetry, INHERITED, routed to security (R7), NOT resolved here |
| `mergeArrivedResults` | `incrementalRunPlan.ts:172` | sourceIndex-keyed row projection - "a row never moves" (AC-7); append-safe | `totalTicketCount` is not a filter bound (F22) - pass the running count |
| `classifyItemFailure` | `incrementalRunPlan.ts:198` | one item's failure -> isolated `grading-failed` row (AC-5) | |
| `canonicalColumns` | `incrementalRunPlan.ts:237` | stable columns from `criteriaNames` (AC-12) | frozen when `criteriaNames` non-empty, which the header guarantees |
| `buildIncrementalRun` | `incrementalRunPlan.ts:260` | assembles the ONE `GradingRun` from raw arrived rows | recomputed every call (F21) |
| `GradeRunItemRequestBody`, `ArrivedItemResult`, `INCREMENTAL_CONCURRENCY`, `estimateEntryWireBytes`, `ITEM_REQUEST_BYTE_BUDGET` | `incrementalRunPlan.ts:57-70,31,80,42` | request body type, cap, per-item wire budget | pure leaf, importable from client (`:19-23`) |
| `resolveRunHeader` | `run-header.ts:32` | per-run header: blank-instructions refusal (`:38-40`), blank-rubric synthesis (`:42-47`), `criteriaNames` (`:49`) - AC-2/AC-3/AC-4/AC-12 | SERVER-ONLY (reaches `lib/supabase` via `rubric.ts`); must be called from a "use server" action, never a client closure |
| `classifyGradingUpload`, `buildSingleFileEntry` | `single-file-entry.ts:36,72` | text/single-file/other-file classification + build (AC-8) | `.docx`-as-`.zip` still open (RES-A39A-9), inherited |
| `extractStudentEntries`, `extractCanvasEntries` | imported at `grading-incremental.ts:28` (`extraction.ts`) | zip + Canvas-URL ingestion, and the A44 collision refusal fired inside `extractStudentEntries` (AC-9) | server-only |
| `fetchGradableRepoContent` + `parseSubmissionGithubUrl` | `repo-content.ts:55`; `submission-repo.ts` (`parseSubmissionGithubUrl`) | GitHub-repo-URL -> content, never throws (`:48-54` returns `{error}`) | needs the thin `buildRepoUrlEntry` mapper (3.6); server-only |
| `getGeminiMaxSubmissions` / `DEFAULT_MAX_SUBMISSIONS` | `gemini.ts:129,32` | the session-entry ceiling VALUE (R4) | reuse the value, NOT the `.slice` truncation; the `:57-59` comment still says "5" - STALE, the value is 40 |
| `useIncrementalGradingRun` (as a MODEL, not imported) | `useIncrementalGradingRun.ts:89` | the run-lock, `arrivedRef` append discipline, per-item `.catch` isolation, the no-render `vi.mock("react")` lifecycle-test harness pattern | batch-shaped; COPY the idioms, do NOT extend it (R1, section 2) |
| `prepareGradingRunAction` (as a MODEL) | `grading-incremental.ts:79` | the intake action shape: `requireAppOwner`, wire-budget check, refusal routing, header resolution | fused (a)+(b); the chat splits it - COPY the shape, do NOT call it |
| `assertAlwaysMounted` I-W2 helper | `topLevelTabs.wiring.test.ts:520-567` | the instrument template for the always-mounted mount guard (I-chat-mount, section 8) | model the new instrument on it |
| page.tsx always-mounted capture-panel mount idiom | `page.tsx:685-729` | the display-toggled always-rendered sibling shape the chat mount copies | the chat's justification is state preservation, not a MediaStream (section 7) |

### DO-NOT-REUSE (each with the reason a wrong reuse was tempting)

| Symbol | `file:line` | Why NOT |
|---|---|---|
| `GradingSubmissionKind` | `submission-kind.ts:29` | It is `initial-post | reply | other | unknown` - a DISCUSSION-contribution classification (is a screenshot an original post or a reply), NOT a format taxonomy. Pressing it into the ingestion role carries meanings the format taxonomy cannot produce. Confirmed by the AC and its check. Use the new `ChatSubmissionInput` (3.1). |
| `prepareGradingRunAction` | `grading-incremental.ts:79` | Do NOT call it. It fuses per-run header resolution with per-INPUT extraction over ONE FormData and builds a FIXED ticket list - the batch shape. The chat needs (a) once and (b) per submission. Model its shape; do not invoke it. |
| `useIncrementalGradingRun` | `useIncrementalGradingRun.ts:89` | Do NOT extend or call. Fixed-total drain; extending to a growing queue forks every RULING-131/132 invariant and distorts the batch hook still wired to GradingTab. Author the sibling (R1). |
| `routeGradingRun` / `INCREMENTAL_ROUTE_ENABLED` | `incrementalRunPlan.ts:104,125` | Do NOT call or gate on it. It governs the BATCH form's route choice only (section 2.3). The chat dispatches unconditionally through its own driver. |
| the whole-run fallback path (`mode: "whole-run"`) | `grading-incremental.ts:115,138,150,199` | Do NOT reuse the whole-run fallback in the chat intake. There is no whole-run action on this surface; an oversized entry or unsupported file is a REFUSAL, not a fallback. |
| `DraftedGradesTab`'s plain conditional mount | `page.tsx:649-651` | Do NOT copy the plain-conditional mount for the chat. The chat holds an in-flight run + accumulated rows that a conditional unmount would lose (section 7); it needs the always-mounted treatment, unlike `DraftedGradesTab` (which holds no live resource). |

---

## 7. THE MOUNT - a sixth always-mounted `GradingView` member

### 7.1 Decision: always-mounted, display-toggled - like the capture panels

**Decision: mount `GradingChatPanel` as an always-rendered, display-toggled
top-level sibling of `RecordingTab`/`GradingRecordingPanel`/`SnapshotGradingPanel`
(after `page.tsx:729`, OUTSIDE the `activeTab === "manual"` block), NOT as a
plain conditional inside the `manualView === "grading"` ternary.** [READING]

The mount-lifecycle question the brief poses is "does the chat hold any live
resource across nav?" - YES, but a different kind than the capture panels. It
holds an IN-FLIGHT continuous run: pending `/api/grade-run-item` fetches whose
results accumulate in the hook's refs/state (`arrived`, `results`, the monotonic
counter), plus the completed rows. A plain conditional mount unmounts the panel
(and the hook) the instant the instructor clicks another chip - dropping every
accumulated row and orphaning in-flight requests whose results have nowhere to
land. The owner's mental model ("continuously submit ... while the next is still
being uploaded", and by extension while doing other things) requires the session
to SURVIVE navigation. So the same always-mounted treatment the capture panels
use for a `MediaStream` applies here for the live run state.

The alternative - conditional mount + persist results to a durable store so a
remount rehydrates - is rejected: results carry feedback text and, for
file/image submissions, base64 `rawBase64` in `submittedFiles` (large; memory:
images are large, and the wire-budget module exists precisely because of this),
a poor localStorage fit; and an IN-FLIGHT run cannot be rehydrated (pending
fetches are lost on unmount). Always-mounted is the sound call for preserving an
active run. **Lesser option, owner/UX may choose:** a plain conditional mount
that accepts losing an in-flight run and its rows on navigation (RES-GC-1). This
is a localized page.tsx + instrument choice, not a redesign - it flips the mount
shape and swaps I-chat-mount from the always-mounted assertion to a plain
conditional one.

### 7.2 The enumeration (following wave-2/wave-3 exactly)

`manual-rail.ts` edits (P1), each forced as shown:
1. `GradingView` (`:38`): add `"chat"` -> `"run" | "repos" | "recording" | "snapshots" | "drafts" | "chat"`.
2. `GRADING_VIEW_PRESENCE` (`:40-46`): add `chat: true`. **tsc-forced** (`Record<GradingView, true>` missing property).
3. `destinations` "Grading" group (`:114-122`): add
   `{ id: "grading-chat", label: "Chat", description: "Grade a continuous stream of submissions in a chat-style surface" }`
   (label/description are RES-GC-2, UX). **CANARY-forced** at
   `manual-rail.test.ts:238,377`.
4. `resolveStateFromDestinationId` gradingView IIFE (`:328-335`): add
   `if (id === "grading-chat") return "chat";`. **derived-GUARD-forced** at
   `manual-rail.test.ts:323-337` (iterates `GRADING_VIEWS`, 5th arg `"run"`, so
   a member with no branch falls back to `"run" !== "chat"` -> RED).
5. `getActiveDestinationId` (`:238-239`): NO edit (generic template).
6. `GRADING_VIEWS`, `isGradingView`, `INNER_NAV`, `getInnerNavAriaLabel`,
   `RETIRED_GRADING_POINTERS`: NO edit ("chat" is a new surface, not a retired
   pointer; the "Grading tools" accessible name is preserved by not touching
   `INNER_NAV`).

`page.tsx` edits (P2):
1. Import `GradingChatPanel`.
2. Add an always-rendered display-toggled sibling after `:729` (the
   `SnapshotGradingPanel` div), gated for display and `active` on
   `activeTab === "manual" && toolsSection === "manual" && manualView === "grading" && gradingView === "chat"`.
3. NO edit to the `manualView === "grading" && (gradingView === "run" || gradingView === "repos")`
   ternary (`:619`): "chat" is neither run nor repos, so it does not fall into
   `GradingTab`'s branch - the existing R-1 guard (`topLevelTabs.wiring.test.ts:576-591`)
   stays green. NO edit to the drafts conditional (`:649`).

**The caller rule is discharged:** `page.tsx` (P2) is the SOLE mount of
`GradingChatPanel`, and it is in the write set. `GradingChatPanel` calls
`useContinuousGradingRun`, which calls `prepareChatSubmissionAction` /
`resolveChatRunHeaderAction` and `postGradeRunItem` (the route) - the full chain
is in the wave (section 10). No export ships without its caller.

---

## 8. THE INSTRUMENTS (source-text / pure - none renders a component)

CANARY = freezes a fact the change legitimately alters (update it). GUARD =
tells you the design is wrong (if it reddens, change the design).

| id | Instrument | Object | Direction of failure | Named mutation that reddens it |
|---|---|---|---|---|
| I-inner (update) | `getInnerDestinations("grading")` exact 6-id/label list (`manual-rail.test.ts:238-244,377-390`, and the "five inner destinations" title/description at `:377`) | the destinations array | RED when the Grading group is not exactly 6 ids/labels | omit the `grading-chat` destination -> RED (CANARY: update the list to 6, and the title/description prose) |
| I-resolve (existing GUARD) | derived `GRADING_VIEWS` loop (`manual-rail.test.ts:323-337`) | resolver + `getActiveDestinationId` | RED when a `GRADING_VIEWS` member has no resolver branch | omit the `id === "grading-chat"` resolver branch -> RED (falls back to `"run"`). Do NOT touch; it auto-covers `"chat"` |
| I-aria (existing GUARD) | `getInnerNavAriaLabel("grading") === "Grading tools"` (`manual-rail.test.ts:281`) + parity (`:261-268`) | INNER_NAV | RED if the accessible name regresses | (unaffected - no INNER_NAV edit; kept green as the no-regression proof) |
| I-chat-mount (NEW) | always-mounted guard for `GradingChatPanel`, modelled on `assertAlwaysMounted` (`topLevelTabs.wiring.test.ts:520-567`) | `page.tsx` source | RED when `<GradingChatPanel` is not wrapped in a `style={{ ... display: ... "none" ... }}`-toggled element (i.e. is a conditional render), or has >1 render site, or the wrapper guard omits a required term | put the panel inside the `manualView === "grading"` ternary instead of an always-rendered display-toggled sibling -> RED |
| I-R-1 (existing GUARD) | run/repos ternary scope (`topLevelTabs.wiring.test.ts:576-591`) | `page.tsx` source | RED if the run/repos clause is widened | (unaffected - "chat" is not added to that clause; stays green) |
| I-taxonomy (NEW) | `chatSubmissionIntake.ts` pure-leaf tests: every `ChatSubmissionInput` kind maps to the stated `IntakeOutcome`; `buildTextEntry` produces a non-empty `student` and correct `content`; `classifyGradingUpload` "unsupported" -> refusal | the pure leaf | RED when a kind is dropped or `buildTextEntry` yields an empty `student` | drop the label defaulter (empty student) -> RED; drop a discriminated arm -> RED |
| I-intake-action (NEW) | `grading-chat-intake` wiring test: the collision refusal from `extractStudentEntries` surfaces as `refused` (AC-9); an over-budget entry is `refused` not fallback; `requireAppOwner` is called; both exports are `async` | the server action (source-text + mocked extractors, network blocked) | RED when a collision zip yields entries instead of a refusal, or the wire-budget check is dropped | remove the collision-refusal routing -> RED |
| I-continuous-driver (NEW) | `useContinuousGradingRun.lifecycle.test.ts`, no-render `vi.mock("react")` harness, MOCKED `dispatchItem` seam | the driver | see AC-L / AC-5 / AC-6 / AC-11 below | (per-assertion below) |
| AC-L (removal test, test seat owns construction) | via I-continuous-driver: at least one `dispatchItem` call is in flight BEFORE the final submission's `submit` returns, for N>1 | the sequence of `dispatchItem` calls vs `submit` events | RED when dispatch is batched (no dispatch until a separate trigger or until all submissions arrive) | replace per-submission dispatch with a single end-of-session dispatch -> the "first-call-before-last-submission" fact becomes false -> RED |
| AC-5/AC-6/AC-11 | via I-continuous-driver | driver behaviour | one `dispatchItem` per entry, isolated failure -> `grading-failed` row (AC-5); a second `submit` not gated on the first's completion (AC-6); a submission past `maxEntries` -> visible `refused`, no dispatch (AC-11) | batch dispatch (AC-5/6 red); silent slice instead of refusal (AC-11 red) |

**A note the test seat must carry (per the AC's AC-L caveat):** the driver's
`dispatchItem` seam is the observable point. Because dispatch is a plain async
call the mocked harness counts, call ordering IS observable without a render -
the AC's route-back condition ("if the chosen driver shape makes call ordering
unobservable without a render") does NOT trigger for this shape. That is a
deliberate property of putting the dispatch on an injected seam.

---

## 9. THE GATE

Run from PowerShell, repo root, after the edits. Every path confirmed present on
`8205c2b9`.

```
git status --short
npx tsc --noEmit --incremental false
npm run lint
npm run test:paths -- src/app/components/manual/manual-rail.test.ts src/app/components/tabs/topLevelTabs.wiring.test.ts src/app/components/grading-chat/chatSubmissionIntake.test.ts src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts src/app/actions/grading-chat-intake.test.ts src/app/components/home/useAppNavigation.test.ts src/app/url-state.test.ts src/app/components/canvas-tab/announcements-panel.wiring.test.ts src/app/components/contentTab.wiring.test.ts src/app/components/snapshot-grading/snapshot-grading.structure.test.ts src/lib/module-graph/runtime-import-graph.test.ts src/file-size-ceiling.structure.test.ts src/lib/use-server-exports.test.ts
npm test
npm run build   # REQUIRED this wave (see below)
wc -l <each written production path>   and   @(Get-Content <each>).Count
npm run docs:gate   # for this document
```

Multi-path runs use `npm run test:paths -- <paths>`, NEVER a raw multi-path
`vitest`/`npm test` (which silently drops unmatched args - enforced by
`src/tools/vitest-paths/gate-commands.structure.test.ts`; memory:
test-paths-wrapper). `npx tsc --noEmit --incremental false` carries the flag
because the bare form races on `tsconfig.tsbuildinfo` under concurrency and has
ONE caller.

**`npm run build` IS required this wave** (unlike waves 2/3): this wave adds a
NEW `"use server"` file, `src/app/actions/grading-chat-intake.ts`. `next build`
is the ONLY gate that catches a `"use server"` file exporting a non-async
binding or a type re-export from a `"use server"` module (memory:
use-server-no-type-reexport; `docs/loop/this-repo.md:76-80`). Pass condition:
the `Compiled successfully` line, NEVER exit 0 (the prerender tail fails with no
`.env`). `use-server-exports.test.ts` covers PART of it and is in the
`test:paths` list, but only the part it scans.

**Pass conditions, each naming object / instrument / direction:**

| Object | Instrument | Direction of failure |
|---|---|---|
| the write set | `git status --short` vs the P1-P2 + N1-N4 + T1-T4 list (section 10) | RED when any other path appears - specifically RED if any of the six N13a `class-trends-draft` files, or `GradingTab.tsx`, `useIncrementalGradingRun.ts`, or `incrementalRunPlan.ts` appear (they must NOT be edited) |
| type graph | `npx tsc --noEmit --incremental false` | RED on P1 step 2 (presence map) left undone, or a taxonomy/driver signature mismatch |
| `"use server"` shape | `npm run build` `Compiled successfully` + `use-server-exports.test.ts` | RED if `grading-chat-intake.ts` exports a non-async binding or re-exports a type |
| lint | `npm run lint` | exit 0, no NEW warning in a written file (measured against the same command before the change, never an absolute count) |
| `getInnerDestinations("grading")` | `manual-rail.test.ts` in the run | RED when the Grading group is not exactly 6 ids/labels (I-inner) |
| resolver completeness | derived loop `manual-rail.test.ts:323-337` | RED when `"chat"` has no resolver branch (I-resolve) |
| "Grading tools" name | `manual-rail.test.ts:281` | RED if the accessible name regresses (I-aria; expected green) |
| chat panel ALWAYS-MOUNTED | I-chat-mount (`topLevelTabs.wiring.test.ts`) | RED when `GradingChatPanel` is a conditional render, not a display-toggled always-rendered element |
| taxonomy + driver | the three new tests | RED per the AC-L/AC-5/AC-6/AC-11/AC-8/AC-9 mutations (section 8) |
| written file sizes | both counters | RED above 1000; `page.tsx` ~824 after (~176 under); `GradingChatPanel.tsx` is the only new-file ceiling risk (section 10.3) |
| this document | `npm run docs:gate` | RED on an emoji or a non-text byte (`no-emojis.test.ts`, `source-bytes.structure.test.ts`) |

---

## 10. THE WAVE PLAN (dependency-ordered, disjoint write sets)

### 10.1 Recommendation: ONE wave

**Recommend ONE wave.** The surface is a LAYER, and the reuse spine (route,
plan leaf, extractors) already exists - so the new code is the intake action, the
driver, the panel, and the mount, which are tsc- and reachability-coupled: the
panel calls the driver calls the action calls the leaf; the mount reaches the
panel. Shipping any subset without the panel that reaches it would repeat this
repo's recorded failure - "two items shipped a library and an endpoint with no
surface between them, both verifies passing" (memory:
verify-reachability-not-just-correctness; THE SURFACE IS A LAYER). One wave keeps
every export reachable at the gate.

### 10.2 Write set (production N1-N4, mount P1-P2; tests T1-T4)

| # | Path | New/edit | Contents | Caller in the wave |
|---|---|---|---|---|
| N1 | `src/app/components/grading-chat/chatSubmissionIntake.ts` | NEW (pure leaf) | `ChatSubmissionInput`, `IntakeOutcome`, `buildTextEntry(input, ordinal)`, the label defaulter, re-export of `classifyGradingUpload` for client classification | called by N2 (server) and N3 (driver) |
| N2 | `src/app/actions/grading-chat-intake.ts` | NEW ("use server") | `prepareChatSubmissionAction`, `resolveChatRunHeaderAction`, `buildRepoUrlEntry` (module-private) | called by N3 (driver) |
| N3 | `src/app/components/grading-chat/useContinuousGradingRun.ts` | NEW ("use client") | the continuous driver (section 2.4); imports the pure leaf's projection/failure/column helpers and the request-body type | called by N4 (panel) |
| N4 | `src/app/components/grading-chat/GradingChatPanel.tsx` | NEW ("use client") | the surface: three input panels (instructions, rubric, submission composer), the submission stream, the results table (reusing `RowFeedbackBoxes`/the GradingResults table via the `GradingRun`), persistence (section 12) | called by P2 (page.tsx) |
| P1 | `src/app/components/manual/manual-rail.ts` | EDIT | the 4 enumeration edits (section 7.2) | its own derived guards + P2 |
| P2 | `src/app/page.tsx` | EDIT | import + always-mounted mount (section 7.2) | mounts N4 |
| T1 | `src/app/components/manual/manual-rail.test.ts` | EDIT | I-inner canary updates (5->6 ids/labels; title/description) | - |
| T2 | `src/app/components/tabs/topLevelTabs.wiring.test.ts` | EDIT | author I-chat-mount (section 8) | - |
| T3 | `src/app/components/grading-chat/chatSubmissionIntake.test.ts` | NEW | I-taxonomy | - |
| T4 | `src/app/components/grading-chat/useContinuousGradingRun.lifecycle.test.ts` + `src/app/actions/grading-chat-intake.test.ts` | NEW | I-continuous-driver (AC-L/5/6/11), I-intake-action (AC-8/9) | - |

**Caller rule discharged:** every new export's caller is in the wave (N1->N2/N3,
N2->N3, N3->N4, N4->P2). No type-only exception is claimed (N1 has runtime:
`buildTextEntry`).

**Disjointness [MEASURED, `git status --short`]:** the six N13a
`class-trends-draft` files are the only concurrent edits; NONE intersects this
write set (all under `drafted-grades/` or `lib/grade/class-trends-draft*`). The
`owns` list (10.4) must be intersected against N13a's set before dispatch if
N13a is still running; on inspection they are disjoint (N13a touches
`class-trends-*`, this touches `grading-chat`/`manual-rail`/`page.tsx`/the two
grading-run leaves it only READS).

### 10.3 Per-file line estimates (against the 1000 ceiling)

| Path | Estimate [READING] | Ceiling headroom |
|---|---|---|
| `chatSubmissionIntake.ts` (N1) | ~90-130 | ample |
| `grading-chat-intake.ts` (N2) | ~150-200 | ample |
| `useContinuousGradingRun.ts` (N3) | ~180-240 | ample |
| `GradingChatPanel.tsx` (N4) | ~300-420 | **the only risk** - see below |
| `page.tsx` (P2) | 804 -> ~824 | ~176 under |
| `manual-rail.ts` (P1) | 360 -> ~366 | ample |
| `manual-rail.test.ts` (T1) | 558 -> ~564 | ample |
| `topLevelTabs.wiring.test.ts` (T2) | 634 -> ~665 | ample |

**`GradingChatPanel.tsx` is the one ceiling risk.** A full chat UI (three
panels, a message/submission list, a composer with three input modes, the
results table wiring) could approach 400+. If it exceeds ~500 in the build,
extract the submission composer and/or the results-table wiring into sub-
components IN THIS SAME WAVE (the `RowFeedbackBoxes.tsx` precedent -
`RowFeedbackBoxes.tsx:5-11` records exactly this split when `GradingResults.tsx`
neared the cap). The plan seat should reserve headroom for a
`grading-chat/ChatComposer.tsx` split as a contingency. This is an estimate, not
a measurement - the file does not exist yet.

### 10.4 The `owns` list (source-text readers, run-in-gate, not all written)

A test that reads a written production file AS SOURCE TEXT can redden on a change
it does not import. Instrument: `grep -rln "<basename>" src --include=*.test.ts`,
each opened.

- **`page.tsx` readers** [MEASURED, the wave-3 doc's own scan at
  `tools-grading-subtab-wave3-architecture.md:389-393`, re-confirmed the file
  set is stable]: `action-guard-coverage.test.ts`, `manual-rail.test.ts` (T1),
  `repoGradesSliceA.guards.test.ts`, `snapshot-grading.structure.test.ts`,
  `topLevelTabs.wiring.test.ts` (T2), `canvas-credentials.exports.test.ts`,
  `drafts-nav.test.ts`, `knowledge-return.test.ts`, `runtime-import-graph.test.ts`,
  `visualizer.test.ts`. **All must be in the gate.** The two that assert page.tsx
  STRUCTURE (`snapshot-grading.structure.test.ts`, `topLevelTabs.wiring.test.ts`)
  are the ones most likely to react to a new mount; a red in either is a
  canary-or-guard call, not a bug on sight.
- **`manual-rail.ts` readers** [MEASURED, same scan]:
  `announcements-panel.wiring.test.ts`, `contentTab.wiring.test.ts`,
  `useAppNavigation.test.ts`, `manual-rail.test.ts` (T1),
  `snapshot-grading.structure.test.ts`, `topLevelTabs.wiring.test.ts` (T2).
- **`runtime-import-graph.test.ts`** must run: N2 is a new "use server" module and
  N3 imports from N2/the pure leaf; a client-bundle boundary violation (a client
  file reaching a server-only module) is exactly what the module-graph test
  catches (memory: registry-client-bundle-guard). The pure leaf N1 must NOT
  import `run-header.ts`/`extraction.ts`/`repo-content.ts` (server-only) - those
  live only in N2. This is a design constraint the implementer must hold and the
  graph test enforces.

**Counts to VERIFY in the gate, flagged not guessed (RES-GC-6):**
`snapshot-grading.structure.test.ts` pins page.tsx mount locations; adding a
sibling mount after `:729` should not disturb its assertions (they target the
snapshot panel's own wrapper), but it reads a file this wave edits, so the gate
must run it and a red is a canary-or-guard call.

### 10.5 The optional 1a/1b risk-isolation cut (available, not required)

If smaller diffs are wanted, cut along submission KIND, keeping each half
reachable end to end (never library-without-surface):

- **1a (text-only, full spine):** N1 (text builder + types only), N3, N4 (composer
  accepts TEXT only), P1, P2, and the header-resolution half of N2
  (`resolveChatRunHeaderAction`) + the text passthrough. Ships text-submission
  grading, mounted and reachable, with AC-L/AC-5/AC-6/AC-11 all exercised.
- **1b (file/zip/url):** the extractor half of N2 (`prepareChatSubmissionAction`
  file/zip/url branches + `buildRepoUrlEntry`), the composer's file+URL controls
  (N4 edit), and I-intake-action's AC-8/AC-9 tests.

Each half is independently gateable and reachable. The mount, driver, and header
resolution land in 1a; 1b only widens intake. **Recommend one wave; 1a/1b is a
risk-isolation option, mirroring waves 2/3's stance.**

---

## 11. THE TWO OWNER FORKS, ISOLATED (recommended reading built; alternative slotted)

### R2 - blank rubric (section 4)
- **Built:** `synthesizeRubricWhenBlank: true` (synthesize from instructions).
- **Owner alternative slot:** flip the one boolean to `false` (no-rubric), or add
  one `if (!rubric.trim()) return refused` guard in `beginSession` (refuse).
- **Terminating question if round 2 disputes it:** "Blank rubric on the chat
  surface: SYNTHESIZE from instructions (recommended, matches the zip flow),
  grade with NO rubric, or REFUSE?" Every answer ships - it flips one argument or
  adds one guard, no redesign.

### R3 - URL scope (section 3.3)
- **Built:** Canvas URL (`extractCanvasEntries`) + GitHub repo URL
  (`fetchGradableRepoContent` + the thin `buildRepoUrlEntry` mapper). Arbitrary
  URLs are REFUSED with a named reason. The taxonomy's `url` slot is additive:
  an arbitrary-URL extractor is a new branch in `prepareChatSubmissionAction`,
  not a shape change.
- **Owner-gated additive layer, NOT built this pass:** an arbitrary-URL fetcher.
  It is a NEW fetch egress with an SSRF surface (a pasted URL fetched
  server-side), requires a security review (allowlist/deny-internal-hosts, the
  `vitest.setup.ts` network block means no test here can exercise real fetch),
  and is routed to the security seat + owner (R3-fork, section 13). Do NOT design
  the fetcher here (per the brief).
- **Terminating question if the owner wants arbitrary URLs:** "Fund a
  security-reviewed arbitrary-URL fetcher (new egress, SSRF surface), or keep
  Canvas/GitHub-only?" The recommended reading (Canvas/GitHub-only) ships either
  way; the fetcher is purely additive.

---

## 12. STORAGE / PERSISTENCE (data seat co-owns; this pass sets the shape)

Per memory (persist-ui-control-state: every control persists across reload under
a `ta-` key), and AC-15.

| State | Persist? | Where | Key | Rationale |
|---|---|---|---|---|
| Instructions panel text | YES | localStorage | `ta-grading-chat-instructions` | a control that must survive reload (AC-15); the A39 rubric-memory precedent (`GradingTab.tsx:63`) is the pattern |
| Rubric panel text | YES | localStorage | `ta-grading-chat-rubric` | same |
| Submission composer mode (text/file/url tab) | YES | localStorage | `ta-grading-chat-input-mode` | a selector; precedent `ta-grading-source` (`GradingTab.tsx:111,133`) |
| Optional label draft | NO | ephemeral | - | transient per-submission |
| The submission STREAM + results rows | NO (ephemeral chat state) | in-memory (hook refs/state); preserved across nav by the always-mounted host (section 7) | - | large (feedback text + base64 files); an in-flight run cannot be rehydrated; localStorage is the wrong store (memory: images are large) |
| The resolved run header | NO | in-memory (hook) | - | derived from instructions+rubric; recomputed by `beginSession` |

**Durable run vs ephemeral chat state.** The DURABLE inputs are the three panel
controls (instructions, rubric, input mode) - the "set once, remembered" surface
the owner asked for (AC-17). The EPHEMERAL state is the submission stream and the
results table - a live/completed run held in memory, preserved across navigation
by the always-mounted mount (section 7), lost on a full reload. **This surface
does NOT create a new durable GradingRun store.** The existing `GradingRun` shape
(`types.ts:347`) is reused for the in-memory run (`buildIncrementalRun` output);
persisting a completed chat run to Supabase/drafts is a possible FOLLOW-UP
(RES-GC-7, data seat + owner) - the batch path's own drafts store
(grading-drafts) is the precedent, but wiring it is out of this wave's scope and
not requested.

**Reload-safe read idiom (memory: persisted-details-open-hydration).** The three
persisted controls must use the lazy-initializer + no SSR-mismatch pattern
`GradingTab.tsx:109-113` uses (`useState(() => typeof window === "undefined" ?
default : localStorage.getItem(key) ?? default)`), NOT a mount effect that would
flash the default. The write side mirrors `selectSource` (`GradingTab.tsx:131-134`).
Every `ta-` key read/write is wrapped so a private-window/blocked-storage throw
degrades to the default. Enumerate fields explicitly on write; never spread
(data-seat checker rule). **All AC-15 reload round-trips are OWNER-WALK** (no
render); the NAMED-key requirement above is the testable half (a `ta-` key exists
per control, checkable by source-text).

---

## 13. RESIDUAL REGISTER (owner, instrument, step - all three, or it is a deletion)

**None of these is a row in `docs/BACKLOG.md` yet** - that file is not in this
pass's write set (a concurrent agent may hold it). Until the orchestrator files
them (folding into the GRADING-CHAT home row where sensible) they DO NOT EXIST.
Stated plainly.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RES-GC-1 | Mount lifecycle: always-mounted (recommended) vs plain conditional (loses an in-flight run on nav). A localized page.tsx + I-chat-mount choice, not a redesign. | architect (built always-mounted); owner may reduce | I-chat-mount, flipped to the conditional assertion if chosen | this pass built always-mounted; owner confirms at the walk |
| RES-GC-2 | The `grading-chat` destination LABEL ("Chat") and DESCRIPTION, and the composer's control copy/layout, and the optional per-submission label field | wave-3 UX seat | `manual-rail.test.ts:238,377` exact-list + the UX copy pass | UX wave on the as-built diff |
| RES-GC-3 | Text fast-path: build the entry client-side and dispatch without the server round trip, vs routing text through `prepareChatSubmissionAction` for one validation seam (recommended) | UX + reliability seats | driver test asserting text dispatch latency shape | reliability/UX wave; not a blocker |
| RES-GC-4 | Whether the continuous driver adds an inter-request delay to mirror the batch path's `DEFAULT_INTER_REQUEST_DELAY_MS = 1200` (the per-item route does no pacing) | reliability seat (wave 2) | driver test on dispatch pacing; the model's real rate limit is owner/live-only | reliability wave 2 |
| RES-GC-5 | `maxEntries` default = `getGeminiMaxSubmissions()` (40): right for a large class? | owner | AC-11 assertion at whatever bound is set | owner input; wave ships at 40 |
| RES-GC-6 | `snapshot-grading.structure.test.ts` and other page.tsx source-text readers may react to the new sibling mount | wave-1 implementer | run them in the gate (section 10.4) | the gate settles it; a red is a canary-or-guard call, not a bug on sight |
| RES-GC-7 | Persisting a COMPLETED chat run to a durable store (Supabase/drafts) - the run is in-memory only, lost on reload | data seat + owner | a durable-run store + typed mapper (grading-drafts precedent) | follow-up; not requested, out of wave scope |
| R7 (inherited) | Guard asymmetry: `/api/grade-run-item` is `requireUser()` (`route.ts:133`) while `prepareChatSubmissionAction`/`resolveChatRunHeaderAction` will be `requireAppOwner()` (matching `prepareGradingRunAction`, `grading-incremental.ts:80`) | security + operability seats (wave 2) | read `route.ts:133` vs the two new actions' guards | wave 2 security pass; NOT resolved here |
| R3-fork (inherited) | Arbitrary-URL fetcher: new egress, SSRF surface, needs security review | security seat + owner | AC-10 direction (no misleading "accepts URLs" claim) + a fetch-allowlist review | owner scope call; additive extractor if funded |

---

## 14. THE OWNER WALK (non-gateable, [READING] / owner - no proxy proposed)

No component renders here, so the entire visible/runtime half is the owner's
final step (memory + `this-repo.md:240-242`).

| id | Item | Instrument |
|---|---|---|
| OW-GC-1 | Tools > Grading's inner nav shows a sixth "Chat" item; it renders a chat-styled surface with three input regions (instructions, rubric, submissions) and a growing results table; the inner tablist's accessible name is still "Grading tools" | open the app, Tools > Grading, click Chat; screen reader on the inner tablist |
| OW-GC-2 | Setting instructions + rubric ONCE, then dropping submissions one at a time, produces one row per gradable student, each with per-criterion scores and copyable did-right/did-wrong boxes; a rubric/instructions pasted once is never re-entered (AC-17) | walk a multi-submission session |
| OW-GC-3 | A later submission's grading STARTS while an earlier one is still grading (the felt concurrency, AC-6/AC-L's user-visible half - R6 in the AC) | drop several submissions quickly; watch rows appear out of lockstep |
| OW-GC-4 | Text, a single file, a zip (many students), a Canvas URL (a class), and a GitHub repo URL each grade correctly; an unsupported file and an arbitrary web URL each refuse with a named reason, not a blank/empty row | exercise each intake kind |
| OW-GC-5 | The three panel controls survive a reload (AC-15); an in-flight run survives switching to another Tools chip and back (the always-mounted claim, section 7) | reload; start a run, switch chips, return |
| OW-GC-6 | The copy controls actually copy the right box's text with many rows on screen (AC-13 clipboard; the per-box accessible-name guarantee `RowFeedbackBoxes.tsx:119-127`) | copy from several rows |
| OW-GC-7 | The `maxEntries` ceiling shows a visible refusal at the boundary, never a silent stop (AC-11) | drive a session to 40 |

---

## 15. WHAT I COULD NOT DETERMINE (stated, not filled in)

1. **Anything a user sees or any runtime lifecycle** - no component renders here.
   The always-mounted claim (section 7) is enforced at SOURCE level by I-chat-mount
   and confirmed behaviourally only by OW-GC-5.
2. **The real model's behaviour** - no API key; every LLM path (rubric synthesis,
   grading) is mock-only here. That a real model returns distinct strengths vs
   improvements is owner-walk (the SHAPE is testable).
3. **`GradingChatPanel.tsx`'s final size** (10.3) - the file does not exist; the
   ~300-420 estimate is [READING], and the split contingency is flagged.
4. **Whether an arbitrary-URL fetcher is safe** - out of scope by ruling (R3);
   not designed here.
5. **Whether the owner wants a durable completed-run store** (RES-GC-7) - not
   requested; the run is in-memory this wave.

## 16. LEVERAGE LINE

The AC already owns the leverage claim (CONCURRENCY, AC-L) and its removal test;
this architecture does not re-author it. This pass's obligation is to make AC-L
BUILDABLE, and it does: the continuous driver puts each grade dispatch on an
injected `dispatchItem` seam (section 2.4), so a no-render mocked-seam test
observes "at least one dispatch in flight before the final submission is
entered," and the named batching deletion turns that false (section 8). The
architecture confirms the claim is EARNED, not inherited: the concurrency
mechanism (dispatch-on-arrival over the bounded pool, reaching
`/api/grade-run-item` continuously) is NEW code this wave builds - the batch pool
exists but is gated off and reachable only from the batch form (section 2.3).

## 17. GATES RUN ON THIS DOCUMENT

**Run:** `npm run docs:gate`. Result in the hand-back.

**NOT run:** every instrument in sections 8-10. This pass's write set is one
document. No file under `src/` was opened for writing; nothing committed, nothing
pushed. The N1-N4/T3-T4 files do not exist yet and were not created; the existing
tests (T1/T2 targets, the derived guards) were re-read at their cited lines but
none was executed against a modified tree. `git status --short` is reported in
the hand-back and shows only the concurrent N13a files, none in this write set.
