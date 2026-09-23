# A3 re-scoped: PROVENANCE, not recall

Binding premise: `docs/owner-decisions-2026-09-23.md:252-263`, DECISION 11.
Recall is dropped as the goal. The row's value now rests on one sentence a
chat cannot produce: **which recorded facts were sent with this question, and
which of them have changed since.** The retrieval interaction is part of the
deliverable, not a follow-up (`owner-decisions-2026-09-23.md:258-261`).

This document supersedes `docs/a3-scope.md` as the scope. That file is NOT
edited and NOT deleted - it is the record of what was measured against the old
premise and why the premise changed. Section 1 below is a disposition table
mapping every requirement it carried.

Read this pass, on today's tree: `docs/backlog.yml:195-205` (the A3 row),
`docs/a39-research.md` section 5 (`:518-641`), `AGENTS.md`,
`docs/DEV_LOOP.md`, `docs/loop/this-repo.md`, `docs/loop/leverage.md`,
`docs/a3-scope.md`, `docs/a39-architecture.md` sections cited inline.

**Every citation below was opened this pass.** Where the old scope's line
number had drifted, the drift is named rather than silently corrected.

---

## 1. Disposition of everything `docs/a3-scope.md` required

| Prior requirement | Where it was | Disposition |
|---|---|---|
| The four 2026-09-15 check items (contamination, row shape, read-back must be a server action, auth-guard pin) | a3-scope.md section 7 | **KEPT in substance, three of four re-routed.** Contamination and row-shape are now MOOT-BY-DESIGN (R-STORE-1: a new table, no `course_intel_answers` reuse) and recorded as the REASON for that choice, not as open items. "Read-back must be a server action" is KEPT as R-READ-1. The auth-guard pin is KEPT as R-GUARD-1 but its cost changed - see section 3.4, the pin may not need to move at all. |
| Wave 0 - owner decision among Redesign / Accept / Reject | a3-scope.md section 8, residuals 1 and 2 | **WITHDRAWN - discharged.** DECISION 11 answered it (Redesign, around provenance). No enforcer protected it; it was an escalation, and the escalation was answered. |
| Wave 1 - storage (new table, new lib module, persistence call in `llm-content.ts`, pin removal) | a3-scope.md section 8 | **KEPT with a changed shape.** The table is still new; the lib module is still new; the persistence call moves OUT of `llm-content.ts` into a separate guarded action (section 3.4), which is why R-CEILING-1's pressure drops. Now W1 below. |
| Wave 2 - read-back surface | a3-scope.md section 8 | **KEPT and promoted.** DECISION 11 makes it part of the deliverable, so it is no longer conditional. Now W3 below, with a measured click budget it must beat (section 4). |
| Wave 3 - oracle and guardrails (`ta-` key canary if localStorage; a removal test) | a3-scope.md section 8 | **KEPT, and the localStorage branch is WITHDRAWN.** localStorage cannot hold this record: the differentiating claim is cross-session and cross-device, and a per-browser key silently answers "nothing changed" on a second device. The `ta-` canary finding survives as a fact (section 3.5) and is handed to A-NEXT-KEY below rather than owned here, because this design adds no `ta-` key. |
| Residual 3 - new-table vs discriminator-column | a3-scope.md section 9 | **WITHDRAWN - decided here.** New table. Reason in section 3.1; the `course_intel_answers` migration's own header (`supabase/migrations/20261018000000_course_intel_answers.sql:16-19`) records that it deliberately refused the snapshot precedent, so reusing it is the one option its authors already ruled out. |
| Residual 4 - `llm-content.ts` headroom at wave start | a3-scope.md section 9 | **KEPT, re-measured, and reduced.** Still R-CEILING-1. Re-measured 79 lines of headroom (section 3.3); the design now adds roughly 4 lines to that file instead of a persistence block. |
| Residual 5 - no exact-key-set canary for `src/app/components/courses/` | a3-scope.md section 9 | **HANDED OVER to A-NEXT-KEY (below), with a correction.** The prior scope said the directory has three `ta-` keys plus "three more"; the measured count today is **NINE**, and **zero** are pinned by any test (section 3.5). Not owned by A3, because A3 adds no `ta-` key. |
| Residual 6 - `askAboutCourseAction`'s guard-pin removal | a3-scope.md section 9 | **KEPT as R-GUARD-1, but the direction changed** - section 3.4 shows a shape in which the pin does NOT move, and names what has to be true for that to hold. |
| Residual 7 - the click-cost figures are reading claims | a3-scope.md section 9 | **KEPT as R-UI-1 and widened.** Every interaction count in section 4 is a reading claim; nothing renders under vitest (`docs/loop/this-repo.md:113-118`). |
| Sections 1-6 (the measurements and the "as scoped, A3's value rests on memory alone" verdict) | a3-scope.md sections 1-6 | **KEPT as measurements, WITHDRAWN as conclusions**, per the brief. The verdict was correct against the old premise and DECISION 11 replaced the premise. |

Nothing from `a3-scope.md` is dropped without a line above. Two of its numbers
were stale on today's tree and both are corrected in place below with the
command that measured them.

---

## 2. What "what produced this answer" actually consists of

### 2.1 The distinction the whole feature rests on: SENT, not USED

`askAboutCourseAction` builds one prompt and interpolates the fact block into
it verbatim:

- `src/app/actions/llm-content.ts:887` opens the template literal.
- `:889-890` is the block: a `WHAT THE APP KNOWS ABOUT THIS COURSE:` header
  followed by `${facts || "(nothing recorded)"}`.
- `:892-893` is the question.
- `:902-908` is the single `callLlm` with
  `generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }` at `:905`.

So the app can state, with a line number behind it, exactly what text was
**sent**. It cannot observe what the model **used**: `LlmResult`
(`src/lib/llm.ts:200-202`) is `{ ok: true; text; sources?; finishReason?;
usage?; elapsedMs? }` - there is no attribution channel, and no per-fact
signal comes back. Nothing anywhere in this path can say a fact influenced the
answer.

**Therefore no sentence this feature ships may say "grounded in", "used",
"based on", or "answered from" about the stored facts.** The only defensible
verb is SENT. This is not a style preference: `AskAiModal.tsx:99-102` already
ships "Answers are grounded in this course's own recorded facts", and
`docs/backlog.yml` row A4 records that exact sentence as overstating what
three of its chips do. Repeating that shape inside the feature whose entire
point is honest provenance would be the same defect twice.

### 2.2 The fact families, and where they are assembled

Assembly is one pure function: `renderCourseFacts`
(`src/lib/course-facts.ts:48-135`). Its header states it is
"Pure and DETERMINISTIC: no I/O, no Date.now()/current-time read, no
randomness" (`:4-5`) - which is what makes a fingerprint of its output
meaningful at all. Same `Course` value, same string, forever.

Called from exactly one place on this path: `AskAiModal.tsx:56`,
`renderCourseFacts(course, { includeStudentData: true })`.

What it emits, by group and line:

| Group | Emitted as | Lines |
|---|---|---|
| 19 scalar `Label: value` lines (Name, Course code, Institution, Term, Modality, Start date, End date, Meets, Class length (minutes), Weeks, Tests, Breaks, Assignment due rule, Textbook, Description, Topic outline, LMS, GitHub organization, Contact email) | one line each, OMITTED when blank | `course-facts.ts:51-70` |
| Codebases | `course.repos.map(r => r.repo).join(", ")` | `:72-76` |
| Integrations | a COUNT only, never the contents | `:77-79` |
| Course project (name, definition, milestones) | three pushes, gated on `hasProject` | `:83-93` |
| Schedule of topics | `course.csvData` in full | `:97-99` |
| Roster | raw text, gated on `includeStudentData` | `:108-111` |
| Weekly checklist | labels only, never done/undone state | `:113-126` |
| Grades due | `describeGradesDue(...)` | `:128-131` |

**Measured, not recalled:** `renderCourseFacts` reads **27** distinct
`course.<field>` properties; the `Course` interface
(`src/lib/supabase/courses.types.ts:62-253`) declares **55**. Command, run
this pass from the repo root (a Python one-liner, because a regex over the
interface body is the only way to count declared properties without hand
transcription):

```
python3 -c "import re;src=open('src/lib/supabase/courses.types.ts').read();i=src.index('export interface Course {');j=src.index(chr(10)+'}',i);b=re.sub(r'//.*','',re.sub(r'/\*.*?\*/','',src[i:j],flags=re.S));print(len(re.findall(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:',b,flags=re.M)))"
  -> 55

python3 -c "import re;print(len(set(re.findall(r'course\.([A-Za-z0-9_]+)',open('src/lib/course-facts.ts').read()))))"
  -> 27
```

That 27-of-55 ratio is load-bearing twice below: it is why `course.updatedAt`
is the wrong staleness signal (section 5.2), and it is why the fingerprint
must be per-field rather than a single digest of the whole row.

### 2.3 What is knowable at the moment of the call, and what is not

| Thing | Knowable at call time? | Where |
|---|---|---|
| The exact fact block sent | YES, it is the argument | `AskAiModal.tsx:55-60`, `llm-content.ts:865` (`courseFacts.trim()`) |
| Which labels the block contains | YES, derivable from the same `Course` by the same pure function | `course-facts.ts:48-135` |
| The question, trimmed | YES | `llm-content.ts:862` |
| The wall-clock instant | YES | `llm-content.ts:873` (`Date.now()`) |
| The prompt template | YES, but it is an inline literal, not a named constant | `llm-content.ts:887-900` |
| Which model answered | **NO - not returned.** `callLlm` ignores its `provider` argument entirely (`llm.ts:385`, `void provider;`) and delegates to `callGemini`, which resolves `const model = req.webSearch ? getGeminiSearchModel() : getGeminiModel();` at `llm.ts:492`. `getGeminiModel()` is `process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL` (`src/lib/gemini.ts:98-99`; the default literal is `"gemini-3.1-flash-lite"` at `gemini.ts:1`). None of it comes back in `LlmResult`. | `llm.ts:200-202, 375-386, 492` |
| Which facts the answer used | **NO, and never will be** | section 2.1 |

### 2.4 Three answer branches, and only one of them sends facts at all

This is the "every reachable state" work, and it is where a single provenance
sentence would ship false.

- **B1 - deterministic, no model call.** `llm-content.ts:873-877`. A closed
  list of schedule questions (`matchAskAiQuestionShape`,
  `src/lib/week-numbering.ts:179-184`; the list at `:164-167`) is answered by
  `computeDeterministicScheduleAnswer` (`llm-content.ts:812-837`) from
  `courseDates` - `{ startDate, endDate, weeks }`, passed separately at
  `AskAiModal.tsx:58` - **and from `now`**. The fact block is never read on
  this branch. One of the five UI chips, "What week are we in?"
  (`AskAiModal.tsx:28`), is deliberately a member of that closed list
  (`AskAiModal.tsx:21-27`).
- **B2 - embedded, no model configured.** `llm-content.ts:881-885`. The facts
  are echoed back inside the answer text itself. No model sees them.
- **B3 - the model call.** `llm-content.ts:887-917`. The only branch where the
  fact block is sent to anything.
- **B4 - failure.** `:911` (HTTP), `:915` (empty answer), `:919` (throw).
  There is no answer, so there is no provenance row to write.

**Consequence, carried into section 5:** a provenance record needs a branch
discriminator, and the read surface must render three different sentences.
A B1 row's answer goes stale by the CLOCK, which no fingerprint of the facts
can see.

---

## 3. A fingerprint, not a copy

### 3.1 What already exists - surveyed from the tree, not from a design doc

Four relevant idioms ship today. None of them was invented for A3, and A3 must
not invent a fifth.

| Idiom | Where | What it is | Durable? |
|---|---|---|---|
| `rubricFingerprint` | `src/lib/research/rubric-bank.ts:28-30` | `createHash("sha256").update(cleanText(text).toLowerCase()).digest("hex")` | **YES** - it is the `rubric_bank` row `id` in the upsert at `:70` |
| `contentHash` | `src/lib/canvas-modules/mappers.ts:68-70` | `createHash("sha1")...slice(0, 16)` | Canvas content change-detection, a different job |
| `hashString` | `src/lib/embedded/scaffold.ts:27-35` | FNV-1a 32-bit, returns a number | Bucketing, not identity |
| `fingerprintScopePages` + `summaryStaleness` | `src/lib/knowledge-overview-stale.ts:57-61` and `:134-173` | A per-item `{id, updatedAt}` LIST persisted at generation time, diffed at read against the live set, producing `{stale, reasons, changedTitles, addedTitles, removedTitles}` | **YES** - persisted as `institution_knowledge_summaries.source_pages` (`supabase/migrations/20261011000000_institution_knowledge_overview.sql:100-106`), read at `src/app/components/knowledge/useKnowledgeOverview.ts:247` |

Only four `createHash(` call sites exist in `src/` at all
(`grep -rn "createHash(" src --include=*.ts` -> 4 lines: `mappers.ts:69`,
`rubric-bank.ts:29`, `slide-prompt.test.ts:212`, `slide-prompt.test.ts:288`).

A39 uses `rubricFingerprint` for exactly this purpose and states the
discipline A3 must copy: both provenance fields "are **read back from the run,
never re-derived from the store**. Editing the stored rubric afterwards cannot
change what a past run reports" (`docs/a39-architecture.md:854-858`).

### 3.2 The shape, and why it is a LIST of digests, not one digest

**Recommended shape** (the architect seat owns the final call; this is a
recommendation with its argument, not a default):

```
AskAiProvenance = {
  branch: "deterministic" | "embedded" | "model",
  factsShapeVersion: number,        // bumped when renderCourseFacts's label set moves
  factFingerprints: Array<{ label: string; digest: string }>,   // sorted by label
  factsDigest: string,              // sha256 of the whole sent block
  promptVersion: string,            // sha256 of the extracted prompt template
  model: string | null,             // null on B1/B2
  askedAt: string,                  // ISO, app clock
}
```

Three arguments for the per-label LIST over a single opaque digest, each
checkable:

1. **A scalar digest cannot name what changed.** The differentiating sentence
   DECISION 11 buys is "these facts changed since this answer"; naming them is
   what a chat cannot do, and `knowledge-overview-stale.ts:93-99` already
   states the same reasoning for its own feature: the title lists are "never
   re-derived from a bare count, since a count alone cannot say WHICH pages
   changed".
2. **It is the repo's established staleness idiom, applied to a different key
   space.** `PageFingerprint` is `{id, updatedAt}`; A3's is `{label, digest}`.
   `summaryStaleness`'s three branches (`:152-158`) transfer one-for-one:
   a label present-then-absent is a fact REMOVED, absent-then-present is
   ADDED, present-in-both-with-different-digest is CHANGED. The delete case
   its comment flags (`:117-122`) is real here too: clearing the Textbook
   field leaves no "changed" signal anywhere except the label disappearing.
3. **Digesting each field, rather than storing it, is what makes this
   shippable at all.** The `course_intel_answers` migration header records
   that its authors saw `institution_knowledge_summaries.source_pages` and
   **deliberately refused to copy it**, because storing the assembled corpus
   would persist per-student material
   (`supabase/migrations/20261018000000_course_intel_answers.sql:9-19`). A3
   sends a Roster block containing student names verbatim
   (`course-facts.ts:110`). Storing a **digest** of the roster keeps the
   staleness signal and stores no name. This is the reason the shape is a
   fingerprint and not a copy, stated against the repo's own prior refusal.

**What the digest-only choice costs, stated plainly:** the read surface can say
*that* the Textbook changed and *when* the answer was asked. It **cannot show
the old value**, because the old value was never stored. A39 chose differently
- it carries `rubricUsed` (the full text) alongside the fingerprint
(`a39-architecture.md:853-856`) - and that difference is deliberate here, not
an oversight: A39's rubric is instructor-authored text with no third-party PII;
A3's fact block contains a class roster.

**Reuse, exactly:** the digest function is `rubricFingerprint`'s body, not a
new one. It must be **moved to a shared leaf and re-exported**, not copied -
A39 wave W2 already plans that exact move (`docs/a39-waves.md:998`,
`:1882`: `rubricFingerprint` moved to `rubric-fingerprint.ts` with
`rubric-bank.ts` re-exporting). **A3 must consume that module, not race it.**
See R-SEQ-1.

**One property of that reuse, named because it is surprising:**
`rubricFingerprint` lowercases and collapses all whitespace
(`cleanText`, `src/lib/embedded/scaffold.ts:23-25`, `text.replace(/\s+/g, " ").trim()`).
So a fact whose only change is casing or whitespace fingerprints IDENTICALLY
and will NOT be reported as changed. For a rubric that is a feature. For A3 it
is a deliberate, documented accepted loss: "Textbook: clean code" to
"Textbook: Clean Code" will read as unchanged. If the architect wants
case-sensitivity, that is a DIFFERENT function and it must be named as such,
not a quiet second spelling of this one.

### 3.3 The prompt version

`promptVersion` has an established idiom and a blocker.

The idiom: `src/lib/slide-prompt.test.ts:210-215` pins a prompt constant by
frozen sha256 plus length, with a comment rule that "every intentional move has
to say what moved it" (`:205-206`).

The blocker: the Ask AI prompt is an **inline template literal inside the
function** (`llm-content.ts:887-900`), interpolating `facts` and `ask`. It is
not an exported constant, so nothing can hash it. W1 must extract the invariant
text (the preamble at `:887`, the two section headers at `:889` and `:892`, and
the four requirement lines at `:895-900`) into a named exported constant and
build the prompt from it. That extraction is a behaviour-preserving refactor of
one function and it is the only reason W1 touches `llm-content.ts` at all
beyond the fingerprint return.

### 3.4 The model, and the auth-guard pin - where the prior scope's cost drops

The prior scope assumed persistence lands inside `askAboutCourseAction`, which
forces `requireUser()` onto a deliberately unguarded action and forces a pinned
list to change in the same commit. Re-measured this pass and still exactly
true: `PINNED_UNGUARDED` is declared at
`src/app/actions/action-guard-coverage.test.ts:235`, its entries occupy
`:236-263`, `askAboutCourseAction` is at `:258`, and `:450` is
`expect(unguarded).toEqual(PINNED_UNGUARDED)` - **exact-set equality, read
directly**. The count is 28:

```
sed -n '236,263p' src/app/actions/action-guard-coverage.test.ts | grep -c '^\s*"'
  -> 28
```

(The row's own citation of `:248` and `a3-scope.md`'s `:258` - the file has
moved since 2026-09-15; `:258` is right today, `:248` is `generateLecturePlanForAssignmentAction`.)

**A shape that avoids the pin entirely, recommended.** Split the write:

1. `askAboutCourseAction` gains **no Supabase, no auth, no storage**. It gains
   the extracted prompt constant and returns the provenance it already knows:
   `{ answer, provenance }` where `provenance` carries `branch`,
   `factFingerprints`, `factsDigest`, `promptVersion`, `factsShapeVersion`,
   `model`, `askedAt`. Every one of those is computed from values the function
   already holds. This preserves the architectural boundary the file states
   about itself at `llm-content.ts:843-845` - the action stays "free of the
   Supabase row shape".
2. A **new, separate, guarded** `"use server"` action owns the insert, called
   by the modal after the answer returns. It is new, so it is guarded from
   birth and never enters `PINNED_UNGUARDED`.

**Blast radius of widening the return type, measured:**
`grep -rn "askAboutCourseAction" src --include=*.ts --include=*.tsx` returns 30
lines across 8 files, of which exactly **ONE is a production call site** -
`src/app/components/courses/AskAiModal.tsx:55`. The rest are
`llm-content.test.ts` (17 call lines), the pin at
`action-guard-coverage.test.ts:258`, three comment references
(`media-likeness.ts:439`, `week-numbering.ts:132`, `:190`), and
`src/loop-docs.structure.test.ts:193`. Canary: the same grep for
`askAboutCourseActionZZZ` returns 0, so the pattern fires and the shape is
valid. The discriminator is `"error" in result` (`AskAiModal.tsx:62`), so
adding a field to the success member is type-safe.

**Where `model` comes from, and the honest limit.** The action can call
`getGeminiModel()` itself (`gemini.ts:98-99`) - it is a server module and the
env read is the same read `callGemini` makes microseconds later in the same
process. That is a **re-derivation, not an observation**, and it is only equal
to the truth while `askAboutCourseAction`'s request sets no `webSearch`
(`llm.ts:492` branches on it). Two dispositions, and this document recommends
the first:

- **(a) Re-derive, and pin the assumption.** Record `getGeminiModel()`, and add
  a source-text assertion that `askAboutCourseAction`'s `callLlm` request
  contains no `webSearch` key. Cheap, contained, and the assumption is guarded
  rather than assumed.
- **(b) Observe it.** Add `model?: string` to `LlmResult`'s `ok: true` member
  (`llm.ts:201`) and set it in `callGemini`. Strictly more honest. Cost:
  `llm.ts` is the shared leaf for **127 non-test `callLlm(` call sites**
  (`grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l`
  -> 127; canary `callLlmZZZNoSuchThing(` -> 0). An optional field is
  type-safe, but `llm.ts` is the highest-traffic shared file this design could
  touch, and `docs/loop/parallel-disjointness.md`'s rule is that a one-line
  change to a shared helper can break forty. Not worth it for this row alone;
  worth it if another row needs it too.

### 3.5 Where it is stored, and what it costs

**Storage: a new table.** Not `course_intel_answers`. Re-confirmed this pass
that reusing it still contaminates a shipped surface -
`src/app/actions/course-intel.ts:113` calls
`listAllCourseIntelAnswers(supabase, user.id)` and `:132`
`clearAllCourseIntelAnswers(supabase, user.id)`, both with no course filter and
no feature filter - and the row shape still does not fit
(`AppendCourseIntelAnswerCommon` at `src/lib/course-intel/history.ts:415-431`
requires `citedStudents`, `omissions`, `assembledAt`, `tier: AssemblyTier`, and
`AssemblyTier` is the closed two-member union at
`src/lib/course-intel/types.ts:385`). Both facts are inherited from
`a3-scope.md` sections 1 and 7 and were re-opened this pass.

The table follows `course_intel_answers`' own construction verbatim where it
applies: `id uuid primary key default gen_random_uuid()`, `user_id uuid not
null references auth.users (id) on delete cascade`, `course_id uuid not null
references public.course_hub (id) on delete cascade`, one index on
`(user_id, course_id, created_at desc)`, RLS enabled, and the header note that
the service-role path makes the explicit `user_id` filter the real tenant
boundary (`20261018000000_course_intel_answers.sql:91-101, 106-118, 140-141`).
`model text` with no CHECK follows
`20261011000000_institution_knowledge_overview.sql:107-108` ("a new model id
must never make a save fail").

**LOCALSTORAGE IS RULED OUT, not deferred.** The claim is "these facts changed
since this answer"; a per-browser key answers "nothing changed" on a second
device because it has no rows there. That is a silently false sentence, which
is the one outcome this design exists to avoid.

**Line counts.** Measured this pass with all three instruments, because two of
them disagree in this repo by 15 to 138 (`docs/loop/this-repo.md:6-12`):

| File | `@(Get-Content).Count` (mandated) | `wc -l` | `Measure-Object -Line` | Delta (mandated minus Measure-Object) |
|---|---|---|---|---|
| `src/app/actions/llm-content.ts` | **921** | 921 | 791 | 130 |
| `src/app/components/courses/CoursesTable.tsx` | 792 | 792 | 748 | 44 |
| `src/lib/course-intel/history.ts` | 569 | 569 | 530 | 39 |
| `src/app/components/CoursesTab.tsx` | 474 | 474 | 451 | 23 |
| `src/app/components/course-intel/CourseIntelHistory.tsx` | 308 | 308 | 292 | 16 |
| `src/app/components/courses/AskAiModal.tsx` | 152 | 152 | 144 | 8 |
| `src/lib/course-facts.ts` | 135 | 135 | 125 | 10 |

Commands (PowerShell, repo root, this pass):
`foreach ($f in $files) { @(Get-Content $f).Count; (Get-Content $f | Measure-Object -Line).Lines }`
and, from the Bash tool, `wc -l < $f`. `wc -l` and `@(Get-Content).Count`
agreed on all seven; `Measure-Object -Line` was low on all seven.

**The ceiling.** `const LIMIT = 1000;` at
`src/file-size-ceiling.structure.test.ts:41`. **This corrects
`docs/loop/this-repo.md:152`, which cites `:30`** - the same correction
`a3-scope.md` made, re-verified today by `grep -n "const LIMIT"` returning
only `41:const LIMIT = 1000;`. None of the seven files is in `ALLOWED_OVERAGE`
(declared at `:75`):

```
grep -c "llm-content.ts\|CourseIntelHistory.tsx\|course-intel/history.ts\|components/CoursesTab.tsx\|courses/AskAiModal.tsx\|lib/course-facts.ts" src/file-size-ceiling.structure.test.ts
  -> 0
CANARY, same grep, a string that IS in the file:
grep -c "ALLOWED_OVERAGE" src/file-size-ceiling.structure.test.ts
  -> 2
```

So `llm-content.ts` has **79 lines of headroom** (1000 - 921). Under the
section 3.4 split, W1 adds to it: one import, the extracted prompt constant
(which is a MOVE of existing text within the file, roughly net zero), and about
4 lines building the provenance object. R-CEILING-1 re-measures at dispatch.

**The `ta-` key canary finding, corrected and handed over.** This design adds
no `ta-` key, so it owns no canary. But the prior scope's figure was wrong and
the correction belongs somewhere. Measured this pass:

```
grep -rn '"ta-[a-z0-9-]*"' src/app/components/courses --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> 9 keys: ta-courses-sort, ta-courses-columns, ta-courses-column-order (CoursesTable.tsx:50-52);
     ta-weekly-checklist-new-item-kind (WeeklyChecklistCell.tsx:160);
     ta-weekly-checklist-overview-{sort,search,hide-done,pos,size} (WeeklyChecklistOverviewModal.tsx:84-88)

for each of the nine: grep -rn "<key>" src --include=*.test.ts | wc -l   -> 0, all nine
CANARY, same command shape on a key that IS pinned:
grep -rn "ta-course-intel-history-open" src --include=*.test.ts   -> 3 hits, exit 0
```

`a3-scope.md` said three keys plus "three more". It is nine, and zero of nine
are pinned by any test. The working precedent remains
`src/app/components/course-intel/courseIntelUiState.test.ts:82-83`, an
ordinal key/owner list.

---

## 4. The retrieval interaction - the part DECISION 11 made non-optional

Every count in this section is a **reading claim**. No component renders under
vitest (`docs/loop/this-repo.md:113-118`), so nothing here was observed; it was
read off source. R-UI-1.

### 4.1 The budget this design has to beat

**Re-asking, measured from the Courses tab with the row visible:**

1. Click "Ask AI" - `src/app/components/courses/CourseRow.tsx:687-689`, a plain
   button in the row's actions cell, no expansion required. Mounts the modal at
   `src/app/components/CoursesTab.tsx:448`.
2. Click a suggestion chip - `AskAiModal.tsx:104-117`; `:112` is
   `void ask(s)`, so the chip both fills and fires.

= **2 clicks, plus a model call.** For a typed question it is 1 click, typing
the question (the box is `useState` at `:44`, NOT persisted - there is no
`ta-` key in this file), then 1 click on Ask (`:124`).

**The measured precedent this design must NOT repeat**
(`CourseIntelHistory.tsx`), re-verified today:

1. Leave the Courses tab, click the Course Intel tab - `src/app/page.tsx:662`
   gates `CourseIntelTab` on `activeTab === "course-intel"`.
2. Expand the history section - it starts collapsed.
   `src/app/components/course-intel/useCourseIntel.ts:120-124`:
   `HISTORY_OPEN_KEY = "ta-course-intel-history-open"` and
   `loadHistoryOpen()` returns `readLocalStorage(HISTORY_OPEN_KEY) === "true"`,
   i.e. false unless a prior visit opened it.
3. Scan an unscoped list: no course filter and no feature filter
   (section 3.5), newest-first, and **no search box** - the props interface at
   `CourseIntelHistory.tsx:151-165` has `entries`, `courseNames`, `loading`,
   `open`, `onToggleOpen`, `deletingId`, `onDelete`, `clearing`, `onClearAll`,
   `error`, and no `filter`/`search`. (`a3-scope.md` cited these props at
   `:148-160`; they are at `:151-165` today.)

= **2 clicks plus a tab switch plus an unscoped scan.** More expensive than
re-asking, exactly as DECISION 11 states.

### 4.2 The design, and its click count

**Render the provenance INSIDE `AskAiModal`, scoped to this one course, with
the verdict visible on open.**

| What the instructor wants | Interactions in this design | Interactions to get it by re-asking |
|---|---|---|
| "Have the facts changed since I asked this?" | **1** - the same "Ask AI" click that opens the modal. The verdict line renders in the modal body. Zero clicks beyond the one they were already spending. | **Impossible.** Re-asking produces a new answer; it cannot tell you the old one is out of date, and it cannot tell you which fact moved. |
| The text of a past answer | **2** - open the modal, expand one row | 2 clicks plus a model call plus latency, and the answer will differ (temperature 0.4, `llm-content.ts:905`) |
| What was sent with a past question | **2** - the same expand | Not available at all |

**So the answer to the brief's question is: 1 interaction, and it is an
interaction the instructor was already spending.** It beats re-asking, and on
the differentiating question it beats it infinitely, because re-asking cannot
answer it.

**Why it is safe to render the verdict on open.** Nothing is fetched twice and
nothing blocks the question box: the modal already has `course` (the full
`Course` prop, `AskAiModal.tsx:32`), so the read is one server action call on
mount returning the stored rows plus the staleness verdict.

**Scope and bound.** Newest 5 rows for THIS `course.id`, with the count of
older rows stated as text and no pagination in W3 (R-PAGE-1). Rows are
collapsed to one line each: the question, the ask date, and the verdict.

**The one thing this design must not become.** If the panel is collapsed by
default, the verdict costs 2 clicks and the whole argument above collapses
with it. If a later pass makes it collapsible with a persisted open state, it
inherits the hydration trap
(a `localStorage`-seeded `useState` initializer never shows on reload) and
needs a mount effect. Recorded as R-COLLAPSE-1 rather than designed here.

---

## 5. Staleness, and what may honestly be written on screen

### 5.1 The rule this section obeys

A sentence ships only if it holds on **every** branch in section 2.4 and
**every** read-time state in 5.3. `AskAiModal.tsx:99-102` is the standing
example of what happens otherwise. Nothing below is final copy - the UX seat
owns wording - but each proposed sentence is stated with the exact state it is
legal in, so a checker can falsify it by naming a state it fails on.

### 5.2 `course.updatedAt` is the wrong instrument, and this is why

`Course.updatedAt: string` exists (`src/lib/supabase/courses.types.ts:252`),
written by the app clock at `src/lib/supabase/courses.row.ts:287`
(`new Date().toISOString()`). Comparing a stored copy of it by string
inequality would be the same shape `summaryStaleness` uses
(`knowledge-overview-stale.ts:156`).

**It is still wrong here.** `updatedAt` moves when ANY of the 55 `Course`
fields changes; `renderCourseFacts` reads 27 of them (section 2.2). So **28
fields can change without altering one character of what was sent**, and every
one of them would make the app say "these facts changed since this answer".
That is a false sentence with a 28/55 surface. The per-label fingerprint list
has no such failure: it is computed from exactly the emitted output.

This also disposes of the cheapest-looking design. It is named here so a later
pass does not rediscover it as an optimisation.

### 5.3 The read-time states, and the sentence legal in each

| State | Condition | What may be said |
|---|---|---|
| S1 | B3 row, stored and current label sets equal, every digest equal | "Asked <date>. <N> recorded facts were sent with this question; none of them has changed since." |
| S2 | B3 row, some labels differ | "Asked <date>. <K> of the <N> recorded facts sent with this question have changed since: <labels>." Added and removed labels are named as added and removed, never as changed (`knowledge-overview-stale.ts:152-158`). |
| S3 | B3 row, the block was empty at ask time (`facts` blank, so `llm-content.ts:890` sent the literal `(nothing recorded)`) | "Asked <date>. No recorded facts were available to send with this question." Never a count of zero dressed as a fact list. |
| S4 | B1 row (deterministic) | "Asked <date>. Answered from this course's start date, end date and week count - no model was called, and no facts were sent." **No staleness verdict is rendered at all.** |
| S5 | B2 row (embedded) | "Asked <date>. No model was configured, so this question was not answered." No staleness verdict. |
| S6 | `factsShapeVersion` on the row differs from the current constant | "Asked <date>. What this app records about a course has changed since, so these facts cannot be compared." **Never a change list**, because the difference is the app's, not the course's. See 5.4. |
| S7 | Course deleted | No row - `on delete cascade` on `course_id`, following `20261018000000_course_intel_answers.sql:109` |

### 5.4 The trap that would make S2 lie, and the guard for it

If a later release adds a label to `renderCourseFacts` - exactly what A1 did,
adding Roster, Weekly checklist and Grades due (`course-facts.ts:108-131`) -
then every row stored before that release has a stored label set missing those
labels. A naive `summaryStaleness`-shaped diff reports them as **ADDED**, and
the UI says "Roster was added since this answer". **That is false.** The roster
did not change; the app started recording it.

The guard is `factsShapeVersion`, and it needs two things in the SAME commit as
any change to the emitted label set:

1. A `FACTS_SHAPE_VERSION` constant exported from `src/lib/course-facts.ts`,
   bumped whenever the label set moves.
2. A **frozen exact label-set assertion** over
   `renderCourseFacts(fixture, { includeStudentData: true })`, so the set
   cannot move silently.

**No such assertion exists today**, and that is a measured absence, not an
assumption. `src/lib/course-facts.test.ts:170` freezes
`PRE_CHANGE_NO_OPT_IN_OUTPUT = "Name: CS 101\nCourse code: CS101"` and asserts
it with `toBe` at `:174` and `:189` - but that oracle covers only the
**no-opt-in** path. The opt-in path's assertion, AC-GATE-2 at `:180-185`, uses
three `toContain` calls. `toContain` cannot detect an added label. Canary that
the search was valid: the same file DOES contain exact-equality assertions
(`:174`, `:189`, `:142`, `:333`), so a `toBe`-shaped pin is findable in this
file when one exists.

### 5.5 The best moment, stated as the feature's point

S2 is not a caveat this design apologises for. It is the deliverable:
**"Textbook and Schedule of topics changed since this answer"** is a sentence
a chat cannot produce for its own past output, because project instructions and
knowledge can be edited at any time with no record of what was in force
(`docs/a39-research.md:561-567`). The app produces it because the fingerprint
set was written at send time and is read back, never re-derived
(`docs/a39-architecture.md:854-858`).

### 5.6 What the app must never say, in any state

- "Grounded in", "based on", "used", "answered from" - about the fact block on
  B3. Only SENT is observable (section 2.1).
- "This answer is still accurate." Fingerprints match the INPUTS. Nothing here
  re-validates the answer, and `maxOutputTokens: 2048` at temperature 0.4
  (`llm-content.ts:905`) means a re-ask would not reproduce it anyway.
- "Nothing has changed" on a B1 row. A B1 answer ("we are in week 5") goes
  stale by the clock - `now` at `llm-content.ts:873` feeding
  `computeDeterministicScheduleAnswer` at `:874` - and **no fingerprint of the
  facts can see that**. This is the single sharpest hole in the design and S4
  closes it by rendering no verdict at all for that branch.

---

## 6. The leverage question, answered against the mechanism

**CLAIM (classes: CORPUS, per `docs/loop/leverage.md:37`, compounded with
GUARANTEED, `:42`).** For every Ask AI answer, the app stores a per-label
fingerprint set of the exact fact block that was sent, computed server-side at
send time, plus the model id and the prompt-template version. On a later visit
it recomputes the same fingerprints from the course as it stands now, diffs the
two sets, and **names the facts that changed**. The record is read back and
never re-derived from the current course.

**What the instructor does instead today.** Puts the course facts into a chat
project's knowledge and asks there. **What that costs them:** project
instructions and knowledge are editable at any time with no record of what was
in force when a given answer was produced (`docs/a39-research.md:561-567`), so
they cannot answer "is this answer built on facts I have since changed?" for
any past answer - not by scrolling back, because the transcript shows the
question, not the state of the knowledge base at that moment.

**EARNED, not inherited** - measured per `leverage.md:20-27`, which requires
counting how many comparable modules already carry the mechanism for free:

```
Migration files in the repo:         ls supabase/migrations | wc -l            -> 108
Of those, files declaring a table:   grep -rln "create table" supabase/migrations | wc -l  -> 45
Migrations storing an input fingerprint set for staleness:
  grep -rln "source_pages" supabase/migrations                                 -> 2 files,
  of which only 20261011000000_institution_knowledge_overview.sql DECLARES the column
  (20261018000000_course_intel_answers.sql:18 only MENTIONS it, to refuse it)  -> 1
Migrations declaring a model column:  grep -rn "model text" supabase/migrations -> 1 file
```

So the mechanism exists in **one** place out of the 45 table-declaring
migrations (108 migration files in total), and the one
other table that considered it refused it on privacy grounds. It is not
platform infrastructure; it is a thing a feature has to build.

**THE REMOVAL TEST** (the deletion stated, then the assertion traced, per
`leverage.md:146-149`). **STATE THE DELETION:** make the read path recompute
the stored fingerprints from the CURRENT course instead of reading
`row.factFingerprints`. **TRACE THE ASSERTION:** a pure unit test builds a
stored row whose fingerprints were taken from course state X, mutates the
fixture course to state Y (one field), and asserts the reported verdict is
`stale: true` with `changedLabels: ["Textbook"]`. With the deletion, both sides
of the diff come from state Y, so the observed verdict becomes
`stale: false, changedLabels: []`. The assertion's observed value changes,
so it is a removal test. It is buildable here because the diff is a pure
function over typed data, not a rendered component - the same reason
`knowledge-overview-stale.test.ts` exists and runs today.

**CONCESSION, stated rather than buried.** Recall is NOT the claim and must not
be written into the criteria as one. A chat retains its own transcript
(`a39-research.md:596-600`, 5.5: "The app keeps a record" is "a transcript
with extra steps"). The stored answer text exists in this design only so the
provenance has an object to be about. If the owner later strikes the stored
answer text for size or privacy, **the claim above survives unchanged** - which
is the test that the claim really is about provenance and not about memory
wearing provenance's clothes.

**Second concession.** On B1 rows the claim is a different and stronger one
(GUARANTEED: no model was called), and on B2 rows there is no claim at all.
The leverage sentence covers B3 only, and the criteria must say so.

---

## 7. Wave plan

Rule obeyed throughout, from this repo's own scar tissue: **a wave's file list
contains the file that CALLS or RENDERS each new export, or the capability
ships dead with every gate green.** The live instance is in this very feature
family - `src/app/actions/course-intel.ts:24-31` records that its per-course
get/export/clear actions "HAVE NO CALLER IN THIS UI ANY MORE".

### W0 - prerequisite, not a wave

`rubricFingerprint` must already live in its own leaf module. A39 wave W2 plans
that move (`docs/a39-waves.md:998`, `:1882`). **A3 must not move it, must not
copy it, and must not start W1 until it has moved.** R-SEQ-1.

### W1 - the record, computed but not yet stored

| File | Action | Why it is in this wave |
|---|---|---|
| `src/lib/course-facts.ts` | edit | Export `FACTS_SHAPE_VERSION` and a pure `renderCourseFactLabels(course, options)` (or equivalent) returning the emitted `{label, value}` pairs, so the fingerprint set and the sent string come from ONE traversal and cannot drift |
| `src/lib/course-facts.test.ts` | edit | The frozen exact label-set oracle for the opt-in path (section 5.4) - none exists today |
| `src/lib/ask-ai/provenance.ts` | new | The types, the fingerprint-set builder (consuming W0's module), and the pure staleness diff modelled on `summaryStaleness` |
| `src/lib/ask-ai/provenance.test.ts` | new | Including the removal test from section 6 |
| `src/app/actions/llm-content.ts` | edit | **THE CALLER.** Extract the prompt constant (section 3.3); return `provenance` alongside `answer` on all three branches. Watch the 79-line headroom |
| `src/app/actions/llm-content.test.ts` | edit | Branch coverage for the three provenance shapes; the no-`webSearch` pin from section 3.4(a) |

Not in W1: any Supabase import, any migration, any component. W1 ships a
computed-but-unstored record; its only production consumer is the return type,
which W2 uses.

### W2 - storage

| File | Action | Why |
|---|---|---|
| `supabase/migrations/<ts>_ask_ai_provenance.sql` | new | The table (section 3.5). **Auto-applies to production on push to main** (`docs/loop/this-repo.md:233-235`) - there is no local apply step, so `src/supabase-migrations.structure.test.ts` is the only gate |
| `src/lib/ask-ai/history.ts` | new | Append + list-by-course, service-role client with an explicit `user_id` filter as the real tenant boundary |
| `src/lib/ask-ai/history.test.ts` | new | |
| `src/app/actions/ask-ai-provenance.ts` | new | The guarded `"use server"` wrapper: `requireOwner()` + `createServiceClient()`, the idiom at `src/app/actions/course-intel.ts:33-34`. Guarded from birth, so `PINNED_UNGUARDED` never changes |
| `src/app/components/courses/AskAiModal.tsx` | edit | **THE CALLER.** Calls the record action after a successful answer. Without this file the wave ships dead |

The insert must never cost the instructor the answer they just waited for: it
is fire-and-forget from the modal, after `setAnswer`, and a failure is silent
in the answer path.

### W3 - the retrieval surface

| File | Action | Why |
|---|---|---|
| `src/app/actions/ask-ai-provenance.ts` | edit | The guarded read: takes `courseId`, loads the course with `getCourse(userId, id)` (`src/lib/supabase/courses.ts:73`), recomputes today's fingerprints with the same server-side function, returns rows plus verdicts. One hash implementation, server-side, so nothing new reaches the client bundle |
| `src/app/components/courses/AskAiProvenancePanel.tsx` | new | The panel. Renders S1-S6 (section 5.3) |
| `src/app/components/courses/AskAiModal.tsx` | edit | **THE RENDERER.** Mounts the panel and fires the read on mount. Without this file the panel ships dead |
| `src/app/components/courses/askAiProvenanceCopy.ts` | new | The six sentences as a pure, testable module - nothing renders under vitest, so copy is only assertable if it lives in a `.ts` leaf (`docs/loop/this-repo.md:116-118`) |
| `src/app/components/courses/askAiProvenanceCopy.test.ts` | new | One assertion per state S1-S6, plus a negative assertion that no sentence contains "grounded", "based on", or "used" |

### W4 - guards

| File | Action | Why |
|---|---|---|
| `src/app/components/courses/askAiProvenance.wiring.test.ts` | new | Source-text: `AskAiModal.tsx` imports and renders the panel; the record action is called on the success path. `stripComments` first - a regex matches commented-out code (`docs/backlog.yml` row L9) |
| `src/lib/ask-ai/provenance.test.ts` | edit | Sabotage pass: mutate each unit, prove each test can fail |

### Sequencing and disjointness

W1 -> W2 -> W3 -> W4, strictly. W1 and W2 both touch nothing another backlog
row is known to hold except `llm-content.ts`, which A4 does NOT touch (A4 is
`AskAiModal.tsx:16-29` and `:99-102`). **A3 W2/W3 and A4 both edit
`AskAiModal.tsx`**, so by `docs/loop/parallel-disjointness.md` they may not run
simultaneously. A4 is three chip strings plus one sentence; it should land
first. R-SEQ-2.

---

## 8. Acceptance conditions

Each names the object under comparison, the instrument producing each quantity,
and the direction of failure.

| # | Object | Instrument | Fails when |
|---|---|---|---|
| AC-1 | The stored fingerprint set of one row, against the set recomputed from the same unchanged course | `npm run test:paths -- src/lib/ask-ai/provenance.test.ts` | The verdict is not `stale: false` with empty change lists. Direction: a false-positive staleness claim - the app says facts changed when none did |
| AC-2 | The stored set, against a course with exactly one emitted field mutated | same | `changedLabels` is not exactly that one label. Direction: either a missed change (silent, worse) or a wrong label named (visibly false) |
| AC-3 | A stored row whose `factsShapeVersion` differs from the current constant, against today's course | same | Any change list is rendered at all. Direction: the app attributes its own schema change to the instructor's course (section 5.4) |
| AC-4 | The emitted label set of `renderCourseFacts(fixture, { includeStudentData: true })`, against the frozen oracle | `npm run test:paths -- src/lib/course-facts.test.ts` | They differ without `FACTS_SHAPE_VERSION` having been bumped in the same commit. Direction: AC-3's guard goes silently dead |
| AC-5 | The six copy strings, against a forbidden-verb list | `npm run test:paths -- src/app/components/courses/askAiProvenanceCopy.test.ts` | Any string contains "grounded", "based on", "used to answer", or "answered from" in reference to the fact block. Direction: the feature ships the exact overstatement A4 exists to fix |
| AC-6 | `AskAiModal.tsx`'s source, against the panel import and the record call | `npm run test:paths -- src/app/components/courses/askAiProvenance.wiring.test.ts` | Either is absent (after `stripComments`). Direction: the capability ships dead with every other gate green |
| AC-7 | The removal test's observed verdict, before and after the section 6 sabotage | `npm run test:paths -- src/lib/ask-ai/provenance.test.ts`, run once with the sabotage applied and once without, from a `cp` backup, never `git checkout --` | The suite stays green with the sabotage applied. Direction: the leverage claim has no instrument behind it |
| AC-8 | `@(Get-Content src/app/actions/llm-content.ts).Count` against `LIMIT = 1000` | `npm run test:paths -- src/file-size-ceiling.structure.test.ts` plus the PowerShell count | The count reaches 1000. Direction: an innocuous-looking wave turns a shared action file red |
| AC-9 | `unguarded` against `PINNED_UNGUARDED` | `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts` | They differ. Direction: if W2 accidentally guards `askAboutCourseAction`, the exact-set test at `:450` goes red; if a new action ships unguarded, it goes red the other way |

Multi-file runs use the wrapper per file, e.g.
`npm run test:paths -- src/lib/ask-ai/provenance.test.ts src/lib/course-facts.test.ts src/app/components/courses/askAiProvenanceCopy.test.ts`,
which prints one `COVERED`/`NOT COVERED` line per argument. Raw
`npx vitest run <a> <b>` silently drops unmatched arguments and exits 0
(`docs/loop/this-repo.md:32-45`).

---

## 9. Residual register

| Id | Not proven now | Owner | Instrument | Object | Direction of failure | Step |
|---|---|---|---|---|---|---|
| R-SEQ-1 | Whether A39's move of `rubricFingerprint` into its own leaf has landed | Orchestrator | `grep -rn "export function rubricFingerprint" src` plus `git log --oneline -- src/lib/research/rubric-bank.ts` | The shared digest function | A3 copies the body instead of importing it, creating the second fingerprint idiom this design exists to avoid | Check before dispatching W1; if it has not landed, W1 waits |
| R-SEQ-2 | Whether A4 has landed before A3 W2 | Orchestrator | `git status --short` plus the A4 row's state in `docs/backlog.yml` | `src/app/components/courses/AskAiModal.tsx` | Two concurrent agents in one file; one reverts the other | Land A4 first; it is three strings and one sentence |
| R-MODEL-1 | Whether re-deriving `getGeminiModel()` equals the model `callGemini` used | `loop-architect`, then W1's implementer | A source-text assertion that `askAboutCourseAction`'s `callLlm` request has no `webSearch` key; alternatively option (b) in 3.4 | The recorded `model` value | A stored row names a model that did not answer it - a provenance record that is itself false | Decide (a) or (b) in the architect pass; if (a), the pin ships in W1 |
| R-CEILING-1 | `llm-content.ts` headroom at the moment W1 starts | W1's dispatch brief author | `@(Get-Content src/app/actions/llm-content.ts).Count` re-run at dispatch (921 today, 79 of headroom) | `src/app/actions/llm-content.ts` | The wave crosses `LIMIT = 1000` (`file-size-ceiling.structure.test.ts:41`) and the gate turns red on a file the wave barely touched | Re-measure at dispatch; keep all logic in `src/lib/ask-ai/provenance.ts` |
| R-MIG-1 | That the migration is correct against a real database | Repo owner | The GitHub Action run after the push; locally only `npm run test:paths -- src/supabase-migrations.structure.test.ts`, which is lexical | The new table | Migrations auto-apply to production on push to main with no local apply step (`this-repo.md:233-235`); a shape error is first seen as a red Action after the TypeScript that depends on it has merged | Architect review of the migration before W2 dispatch; owner watches the Action |
| R-UI-1 | Every interaction count in section 4 | Repo owner, or a future browser check | Manual verification in a real browser; nothing renders under vitest (`this-repo.md:113-118`) | The 1-click claim in 4.2 and the 2-click precedent in 4.1 | If the real path differs, W3 is scoped against a wrong cost model and DECISION 11's bar is not actually met | Confirm in-browser before treating section 4 as final |
| R-PAGE-1 | What happens past 5 stored rows for one course | `loop-architect`, at W3 | A row-count assertion in `ask-ai/history.test.ts` | The read action's result size | An instructor with a year of answers gets an unbounded list - the unscoped-scan failure this design was built to avoid, rebuilt inside the modal | Decide the bound and the older-rows affordance in the W3 architect pass |
| R-COLLAPSE-1 | Whether the panel is ever made collapsible with persisted state | Whoever proposes it | A mount-effect assertion, plus a `ta-` key ordinal canary modelled on `courseIntelUiState.test.ts:82-83` | The panel's open state | A `localStorage`-seeded `useState` initializer never shows the persisted state on reload, and React only warns on the hydration mismatch; and the verdict would then cost 2 clicks, breaking section 4's argument | Not in W1-W4. If proposed later, it carries both guards |
| A-NEXT-KEY | Nine `ta-` keys under `src/app/components/courses/` are pinned by zero tests | Whoever next adds a `ta-` key in that directory | An ordinal key/owner exact-set canary modelled on `src/app/components/course-intel/courseIntelUiState.test.ts:82-83` | The nine keys listed in 3.5 | A rename or drop goes unnoticed and a user's persisted state silently resets | **Handed over, not owned by A3** - this design adds no `ta-` key. Belongs in `docs/BACKLOG.md` as its own row |
| A-LEVERAGE-DOC | `docs/loop/leverage.md:98-128` uses `AskAiModal.tsx` as its worked NEGATIVE example ("No persistence... The honest leverage claim here is real but thin") | Whoever lands A3's final wave | `npm run test:paths -- src/loop-docs.structure.test.ts` - `:190-193` asserts the negative-example section still contains `AskAiModal.tsx` AND `askAboutCourseAction` | `docs/loop/leverage.md` | If A3 ships and that card is rewritten, an executing test goes red; if it is not rewritten, the repo's own leverage card describes a feature that no longer exists | Not in A3's write set. Record as a row so the card and its guard move together |

**Nothing above is a deletion.** Each names an owner, an instrument, an object,
a direction of failure and a step. Two entries (A-NEXT-KEY, A-LEVERAGE-DOC) are
handovers and say so explicitly, with the receiver and the obligation named.

---

## 10. What this environment could not verify at all

Per `docs/loop/this-repo.md` section 6, stated rather than worked around:

- **No component was rendered.** Every interaction count in section 4 and every
  claim about what appears on screen is a reading claim from source.
- **No database.** No `.env` exists. Nothing about the proposed table, its
  index, its RLS policies or the cascade was executed.
- **No model call.** `GEMINI_API_KEY` is owner-set in Vercel; the `model` value
  section 3.4 discusses was never observed coming back from a real call,
  because it does not come back at all.
- **No browser.** The app cannot be meaningfully driven without env vars.
- **I did not open A39's in-flight artifacts beyond the lines cited.**
  `docs/a39-*` is held by concurrent agents and was read, never written.

---

## 11. Gates run over this document

Write set: exactly one new file, `docs/a3-provenance-scope.md`. Nothing else
was written or edited.

Commands and their results are recorded in the pass report rather than
transcribed here, because a document that quotes its own gate output cannot be
re-verified from itself. The three that were run: the ASCII/NUL scan
(`tr -d -c '\000' < docs/a3-provenance-scope.md | wc -c`, plus a non-ASCII byte
scan), `npm run test:paths -- src/lib/no-emojis.test.ts
src/source-bytes.structure.test.ts` with the exit code read from a file, and
`git status --short`.
