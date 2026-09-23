# A3 scope: persist AskAiModal answers so a later session reads them back

Row: `docs/backlog.yml:195-205` (`- id: 'A3'`), state `unscoped`. Read in full
before this pass began, along with `AGENTS.md`, `docs/DEV_LOOP.md`,
`docs/loop/this-repo.md`, `docs/loop/leverage.md`, and
`docs/a39-research.md` section 5 (lines 518-633) per the brief.

**Verdict up front, argued below: the 2026-09-15 check was right, and it is
still right on today's tree.** The ideation pass's CORPUS claim asserted the
write and left the read-back unguarded; that gap still exists byte-for-byte
today (section 1). Section 5's `docs/a39-research.md` findings do not rescue
it - if anything they narrow the honest claim further, because "the app
remembers and a chat does not" is no longer true in general (a39 5.3, 5.5).
This is not a restructuring of a prior scope document - A3 has never had one -
so there is no disposition table to carry forward; instead, section 7 below
maps the four required changes the 2026-09-15 check listed against what this
pass measured today.

---

## 1. What exists today - both ends traced

**The write end.** `AskAiModal.tsx:44-45`:

```
const [question, setQuestion] = useState("");
const [answer, setAnswer] = useState("");
```

`ask()` at `AskAiModal.tsx:49-67` calls `askAboutCourseAction` and calls
`setAnswer(result.answer)` at `:66`. That is the only write. There is no
`localStorage` call and no import of any persistence module anywhere in
`AskAiModal.tsx` (read in full; the file is 152 lines by
`@(Get-Content src/app/components/courses/AskAiModal.tsx).Count`, run in
PowerShell just now). `askAboutCourseAction` itself
(`src/app/actions/llm-content.ts:855-921`) never imports Supabase - the only
match for "supabase" in that file is a comment at `:844` explaining that the
action is deliberately kept "free of the Supabase row shape" so the caller,
not the action, decides what is worth sending. That is a stated architectural
boundary, not an oversight, and any persistence design crosses it.

**Discarded on close, confirmed by the caller.** `CoursesTab.tsx:448`:

```
{askAiCourse && <AskAiModal course={askAiCourse} onClose={() => setAskAiCourse(null)} />}
```

This is a conditional mount. `onClose` sets `askAiCourse` to `null`, which
unmounts `AskAiModal`, which destroys its `useState` slots. The question and
answer are gone the moment the modal closes; there is no parent-level cache
keeping them alive. Verified by grepping `AskAiModal` across
`src/app --include=*.tsx`: the only render site is this one line.

**What the row's siblings already persist, for contrast.** Under the same
directory, `CoursesTable.tsx:50-52` defines `SORT_KEY = "ta-courses-sort"`,
`COLUMNS_KEY = "ta-courses-columns"`, `COLUMN_ORDER_KEY =
"ta-courses-column-order"`, all read/written via `localStorage`.
`WeeklyChecklistCell.tsx:160` and `WeeklyChecklistOverviewModal.tsx:84-85`
add three more `ta-weekly-checklist-*` keys. None of this is CORPUS in the
leverage taxonomy's sense (`docs/loop/leverage.md:61`, the struck
"Persistence (generic)" row) - it is UI control state, not a record another
act reads back.

**The reuse candidate, checked against the tree, not the row's own gloss.**
`src/app/actions/course-intel.ts:113` -
`listAllCourseIntelAnswers(supabase, user.id)` - and `:132` -
`clearAllCourseIntelAnswers(supabase, user.id)` - both confirmed today to
carry no course filter and no feature filter, exactly as the row states.
`src/lib/course-intel/history.ts:364-376` (`listAllCourseIntelAnswers`) and
`:392-409` (`clearAllCourseIntelAnswers`) scope only by `user_id`
(`:371`, `:399`). Any row written into `course_intel_answers` by any feature
appears in the Course Intel tab's history list and under its "Clear history"
control. This is a real, present-tense fact about the shipped feature, not a
hypothetical.

**The row shape does not fit, confirmed at the type level.**
`history.ts:415-431` (`AppendCourseIntelAnswerCommon`) requires
`citedStudents`, `omissions`, `assembledAt`, and `tier: AssemblyTier`.
`src/lib/course-intel/types.ts:385`: `export type AssemblyTier = "signals" |
"signals+text";`, and the doc comment immediately above at `:335-344` states
tier "says how MUCH was fetched" from a `CourseIntelAssembly` - a typed
object AskAiModal's flow never builds. `AskAiModal.tsx:56` calls
`renderCourseFacts(course, { includeStudentData: true })`, a plain string
render, not an assembly. So an AskAiModal answer is neither `"signals"` nor
`"signals+text"` - it has no assembly step to have a tier of. Note: the
migration's own column comment
(`supabase/migrations/20261018000000_course_intel_answers.sql:128-129`)
says `tier` is stored as free text with **no CHECK constraint**, so the
*database* would silently accept a new string. The blocker is at the
TypeScript layer, not the schema: `AppendCourseIntelAnswerCommon.tier`
is typed `AssemblyTier`, a two-member closed union, so a caller written in
this codebase cannot construct a third value without widening that type in
`types.ts`, `history.ts`, and every exhaustive `switch`/`Record` over it -
confirmed by reading both call sites in
`src/app/api/course-intel/ask/route.ts:497,` `:571`, `:888` (all three pass
literal `tier: "signals"` or `"signals+text"`, never a computed value).

**The auth-guard fact, re-measured.** `src/app/actions/action-guard-coverage.test.ts`
declares `PINNED_UNGUARDED` at `:235`, with entries on lines `:236-263`
(28 entries: `sed -n '236,263p' action-guard-coverage.test.ts | grep -c '^\s*"'`
returns 28) and closes with `].sort();` at `:264`. `askAboutCourseAction` is
listed at `:258` today (the row's own citation, `:248`, has drifted - the
file has moved since 2026-09-15; the count is still 28, only the line number
changed). This is an **exact-set** test (the array is sorted and compared
elsewhere in the file), so adding `requireUser()` to `askAboutCourseAction`
without removing it from this array either leaves a stale pin or fails the
test - confirmed by reading the array is literal strings with no dynamic
membership check that would auto-reconcile. For contrast, `course-intel.ts:31`
imports `requireOwner` (an alias for `requireUser()`, per that file's own
header comment at `:11-12`) and every action in it is guarded - the reuse
candidate already pays this cost; `askAboutCourseAction` does not, today.

**Conclusion for section 1: both ends were traced, and the write end still
writes nowhere. The gap the 2026-09-15 check found is unchanged.**

---

## 2. What "read back" would mean concretely

There is no read-back today, so this section states what one would cost if
built, using the one precedent this repo already shipped in the same feature
family: `CourseIntelHistory.tsx`.

**Where it lives, and how many interactions away from where the question was
asked.** `AskAiModal` opens from the Courses tab (`CoursesTab.tsx:448`).
Course Intel is a *different* top-level tab: `src/app/page.tsx:662-664`
gates `CourseIntelTab` on `activeTab === "course-intel"`. So reaching any
answer persisted there costs, at minimum: (1) leave the Courses tab, click
the Course Intel tab; (2) the history section starts collapsed -
`useCourseIntel.ts:122-124` (`loadHistoryOpen()` returns
`readLocalStorage(HISTORY_OPEN_KEY) === "true"`, i.e. `false` unless a prior
visit explicitly opened it) - so click the toggle
(`CourseIntelHistory.tsx:157`, `open`/`onToggleOpen` props) to expand it;
(3) scan a list that is **not scoped to the course the question was about**
(section 1: no course filter), mixed with every other Q&A the account has
ever produced anywhere in the app, ordered newest-first
(`history.ts:372`, `.order("created_at", { ascending: false })`) with no
search box in `CourseIntelHistory.tsx` (confirmed by reading the file's
props interface at `:148-160` - no `filter`/`search` prop exists). That is a
minimum of 2 clicks plus an unscoped visual scan, on a tab switch away from
where the instructor was working, to retrieve one answer - against 1 click
(reopen the same modal) plus retyping the question to just re-ask it. This is
the same shape a sibling pass is establishing for the rubric-picture
question (owner brief's phrasing: "a stored answer that costs more to find
than to re-ask is worse than not storing it"); I could not open that sibling
document to cite it directly - `docs/n15-rubric-picture-scope.md` does not
exist in this tree as of this measurement (`ls docs | grep -i "n15\|rubric-picture"`
returns nothing) - so this section derives the same conclusion independently
from `CourseIntelHistory.tsx` rather than citing a document that has not
landed yet.

**Keying.** If reused via `course_intel_answers`, an entry is keyed by
`(user_id, course_id, created_at)` (the only index,
`20261018000000_course_intel_answers.sql:140-141`) with no per-feature
column. `describeCourseIntelHistoryScope`
(`CourseIntelHistory.tsx:78-104`) renders which course(s) an entry covers,
but nothing distinguishes "this came from Course Intel's own Q&A flow" from
"this came from the Ask AI course-row button" - both would render as
identical rows in the same list. A reader could not tell them apart without
a new column, which is itself the schema change the row's own title says the
proposal avoided.

**If instead built as its own surface** (a `docs/loop/leverage.md`-style
Redesign, not a reuse), the read-back could live one click away - e.g.
inside `AskAiModal` itself, a collapsed "past answers for this course"
section scoped by `course_id` alone. That removes the tab-switch cost in the
paragraph above, but it is new surface, not a documented existing one - see
the wave plan in section 8, gated on an owner decision this document does
not make.

---

## 3. Staleness - the correctness question

There is no stored answer today, so there is nothing yet that can go stale;
this section states the requirement any build would owe, and deliberately
proposes no user-facing sentence, per the rule that a shipped sentence may
assert only what holds on every caller and every reachable state - two
sentences in this codebase have already shipped false and had to be deleted
(brief's own instruction; I did not chase down which two, since this is a
requirement for a future author, not a claim I am making about the current
tree).

**Why this matters here specifically.** `renderCourseFacts(course, {...})`
(`AskAiModal.tsx:56`) is computed synchronously from the `Course` row at ask
time. That row is mutable - the same tab that opens `AskAiModal` also opens
`AddCourseForm`/`EditableCell` editors over the same course
(`CoursesTable.tsx` imports both `AddCourseForm.tsx` and
`EditableCell.tsx`, confirmed by `find src/app/components/courses -maxdepth 1
-type f`). An instructor can edit the course's schedule, roster, or
textbook minutes after asking a question about it. A stored answer therefore
has a **single, silent expiry condition with no code that detects it**: the
facts a persisted answer was grounded in can drift from the live `Course`
row at any time, and nothing in this repo re-validates a stored answer
against the current row.

**The one existing precedent handles this by disclosure, not by
re-validation, and any A3 design should be measured against it rather than
inventing weaker.** `course_intel_answers.assembled_at`
(migration `:130-131`) is "carried from that assembly, never recomputed
here," specifically so "a stored answer can still disclose its own gaps
after the live assembly is gone" (migration comment `:126-127`). AskAiModal
has no assembly step (section 1), so there is no `assembledAt` to carry -
the closest analog is simply `created_at`, the row's own insert time. **The
requirement, not a proposed sentence:** any read-back UI must show when the
answer was produced, and must never state or imply that a stored answer
reflects the course's *current* state, because nothing in the proposed
design re-checks that. This is a structural requirement for whoever writes
the UI copy next, not copy itself - writing the sentence is exactly the
one-caller/one-state failure mode the brief warns against, and I have not
verified every place a stored answer could be read to know every caller
that sentence would need to hold true for.

---

## 4. Storage shape and limits

**Two live options, both schema changes** (confirming the check's own
finding: "the honest fix is a source discriminator column or a separate
table, which is the schema change the proposal said it avoided" is still
true today - neither option is a zero-schema-change path).

1. **A `source` discriminator column on `course_intel_answers`.** Keeps one
   table, but `listAllCourseIntelAnswers`/`clearAllCourseIntelAnswers`
   (section 1) would need a filter added at every call site that should
   stay Course-Intel-only, or the contamination the check found persists.
   Also still needs the `AssemblyTier`/`assembledAt` mismatch resolved
   (section 1) - a discriminator column does not fix the row-shape problem
   by itself.
2. **A new, separate table** (e.g. modeled on
   `course_intel_answers` but without the `tier`/`omissions`/`assembledAt`
   columns AskAiModal has no data for). Clean of the contamination and
   shape problems, at the cost of a second migration and a second lib
   module.

`localStorage` under a new `ta-` key is a third option **only if** the
"later session" in the row's title is read narrowly as "the same browser,
later" rather than "any device this account signs into" - the existing
`ta-` keys in this codebase (section 1) are all per-browser UI state, never
records another feature reads back. Using it for A3 would be a genuinely
different shape than every existing CORPUS-class instance in
`docs/loop/leverage.md` (all of which are Supabase-backed,
`user_id`-scoped, cross-device). I am not the architect and this document
does not decide the storage shape; it records that whichever is picked,
neither of the two DB options is schema-change-free, and the `localStorage`
option is a narrower promise than the row's own title states.

**The exact-key-set canary, checked both ways.** This repo has a working
precedent for exactly this test class in the same feature:
`src/app/components/course-intel/courseIntelUiState.test.ts:82-83` pins
both of the view's `ta-` keys as an ordinal/owner list -
`{ key: "ta-course-intel-question", owner: "courseIntelUiState.ts (this
module)" }` and `{ key: "ta-course-intel-history-open", owner:
"useCourseIntel.ts" }` - and the header comment at
`useCourseIntel.ts:105-118` explains it was added specifically because a
new persisted control needs one. **No equivalent canary exists for
`src/app/components/courses/` today** - `grep -rn "ta-courses-sort"
src --include=*.test.ts` returns nothing, and `find
src/app/components/courses -name "*.structure.test.ts"` finds none scanning
that directory's `ta-` keys. So if A3 ever ships via `localStorage` in
`courses/`, there is currently no exact-set test to bump in the same commit
- one would have to be written new, modeled on the `courseIntelUiState.test.ts`
pattern, not merely bumped (residual, section 9).

**Size.** `askAboutCourseAction`'s model call sets
`generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }`
(`llm-content.ts:903-906`), so any answer this action returns is bounded to
roughly 2048 output tokens by construction - a few KB of text at most.
Postgres `text`/`jsonb` columns have no practical size ceiling at that
scale; no code-level guard exists or is needed at this size. If the
`localStorage` option were chosen instead, the browser-wide quota (typically
5-10 MB, not measurable from this environment - no browser session was
driven for this pass) becomes the real ceiling, shared with every other
`ta-` key in the app; that is a materially different risk profile than a DB
table's per-row cost, and another reason a DB table is the shape every
existing CORPUS instance in this repo already uses.

---

## 5. Surface and ceiling

Files that would carry the read/write/render load, measured with **both**
counters as required (the two disagree; `@(Get-Content <f>).Count` is the
repo's mandated instrument per `docs/loop/this-repo.md` section 1/3, run in
PowerShell just now):

| File | `@(Get-Content).Count` | `(Get-Content \| Measure-Object -Line).Lines` | Delta |
|---|---|---|---|
| `src/app/actions/llm-content.ts` | 921 | 791 | 130 |
| `src/lib/course-intel/history.ts` | 569 | 530 | 39 |
| `src/app/components/course-intel/CourseIntelHistory.tsx` | 308 | 292 | 16 |
| `src/app/components/CoursesTab.tsx` | 474 | 451 | 23 |
| `src/app/components/courses/AskAiModal.tsx` | 152 | 144 | 8 |

`src/file-size-ceiling.structure.test.ts:41` sets `const LIMIT = 1000;` -
**note this corrects `docs/loop/this-repo.md:148`, which cites `:30` for the
same constant; the file has moved since that card was written, and I am
citing where it actually is today rather than inheriting the stale line.**
None of the five files above appear in that test's `ALLOWED_OVERAGE` ratchet
list (`grep -c "llm-content.ts\|CourseIntelHistory.tsx\|course-intel/history.ts\|components/CoursesTab.tsx" src/file-size-ceiling.structure.test.ts` returns 0), so
each must independently stay under 1000 by the mandated counter.

**The binding constraint is `llm-content.ts`: 921/1000, 79 lines of
headroom.** `askAboutCourseAction` lives in this file (`:855-921`). Any wave
that adds a persistence call here - even a single `await
persistAskAiAnswer(...)` line plus its import - eats into that headroom, and
this file is shared with every other generation action in the codebase (921
lines already, no extraction proposed by this document). This is a residual
for whoever plans the implementation wave (section 9), not something this
scope pass resolves.

**Structural test inventory, measured fresh rather than quoted** (the brief
warns two counting tools disagree by up to 127 across files in this repo;
these two counts use `find`, not line-counting, so they are a different
instrument and not subject to that specific disagreement, but are still
re-measured rather than inherited from any other document):
`find src -name "*.structure.test.ts" | wc -l` returns **22**;
`find src -name "*.wiring.test.ts" | wc -l` returns **77**.

**Rendering.** Per `docs/loop/this-repo.md` section 2 and `AGENTS.md`, no
component is rendered by any test in this repo (`vitest.config.ts`
`environment: "node"`, collecting only `src/**/*.test.ts`). Every claim in
sections 1-3 and 5 above about what a user sees, clicks, or how many
interactions something costs is a **reading claim**, made by opening the
source, never a claim this test suite could confirm by rendering anything.
I did not drive the app in a browser for this pass. Route any UI
confirmation to the owner or to a future manual/browser check before
treating the click counts in section 2 as final.

---

## 6. What genuinely cannot be done in a chat, applied to THIS feature
   (per the brief's instruction to read `docs/a39-research.md` section 5
   before writing this section)

`docs/a39-research.md` section 5 falsified two standing assumptions this
repo's leverage taxonomy used to lean on: a chat **can** persist
instructions/knowledge across sessions via Projects (5.3, citing
Anthropic's own Projects announcement) and **can** write grades back to an
LMS via a community MCP server and a personal access token (5.4). Applied to
A3 specifically:

- **A3's claimed class is CORPUS** (`docs/loop/leverage.md:37`: "A record
  persisted so a LATER act... reads it back"). `a39-research.md:608-616`
  (section 5.5, "Durable records - DOES NOT SURVIVE ON ITS OWN") states this
  plainly: "'The app keeps a record' is therefore not a differentiator by
  itself; it is a transcript with extra steps. The advantage exists only
  when a record is read back by a different act... If no second reader
  exists, the claim should be withdrawn rather than restated." No second
  reader exists for an AskAiModal answer today (section 1), and none is
  designed in the row's own note - the note's four required changes are all
  about making the write land correctly, not about a distinct downstream
  consumer.
- **The "app remembers, chat doesn't" framing is directly unavailable.**
  `a39-research.md:561-564` (section 5.3): "a chat can remember a rubric...
  The row's premise that 'a chat cannot remember a rubric' is false for any
  Projects user." An instructor who puts the same course facts and the same
  question into a Claude Project gets an answer that is *also* retained in
  that Project's own conversation history, retrievable by scrolling back -
  which is the same "reopen and look" cost this document's section 2 charges
  against the in-app read-back, not a cost unique to the chat.
- **What would survive, if A3 were redesigned rather than reused, per
  `a39-research.md:626-628` (section 5.6, item 4): provenance** - "which
  rubric text produced which grade" - restated for this feature as *which
  version of the course facts produced this answer*. That is a narrower,
  real claim: a chat's Project instructions can be edited with no record of
  what was in force when a past answer was produced; a stored row with its
  own `created_at` and the facts string it was built from could state that.
  This is exactly the staleness-disclosure requirement in section 3, looked
  at from the leverage side rather than the correctness side - the same
  mechanism serves both.

**Stated plainly, per the brief's own instruction: as currently scoped, A3's
value rests on memory alone, and memory alone is not available as an
argument after `a39-research.md` section 5.** The only surviving, checkable
claim is provenance (a stored `created_at` plus the exact facts string,
readable later, to show what was known when), and that claim was not what
the 2026-09-15 ideation pass proposed - it proposed persisting the answer,
not persisting *and exposing* the facts-to-answer link. This is a finding
about scope, not a failure of this pass: whoever redesigns A3 next should
scope FOR provenance explicitly, not assume the write alone recovers it.

---

## 7. The 2026-09-15 check's four required changes, re-measured today

Not a disposition table (there is no prior scope document to restructure -
`docs/backlog.yml:195-205` is the only prior artifact, and it is the check's
own note, not a scope doc this pass supersedes). This maps the check's four
items against what this pass measured, so a future reader does not have to
re-derive them.

| # | 2026-09-15 claim | Status today | Where measured |
|---|---|---|---|
| 1 | Reuse contaminates Course Intel's history list and Clear-history control | **Confirmed unchanged.** `listAllCourseIntelAnswers`/`clearAllCourseIntelAnswers` still scope by `user_id` alone. | `course-intel.ts:113,132`; `history.ts:364-376,392-409` |
| 2 | Row shape does not fit (`citedStudents`/`omissions`/`assembledAt`/`tier`) | **Confirmed unchanged, refined:** the DB column tolerates any text (no CHECK), the TypeScript type does not - the real blocker is at the type layer, not the schema. | `history.ts:415-431`; `types.ts:385`; migration `:128-129` |
| 3 | Read-back must move into a server action, since nothing renders here | **Confirmed, and generalized:** no read-back exists at all yet, in any form - section 1, 2 | `AskAiModal.tsx` (full file); `CoursesTab.tsx:448` |
| 4 | Persisting forces a `userId` and an auth guard onto a deliberately unguarded action, pinned in a list | **Confirmed, re-measured at a new line number** (list still 28 entries; the action moved from the check's cited `:248` to today's `:258`) | `action-guard-coverage.test.ts:235-264` |

All four are load-bearing today. Section 6 adds a fifth consideration the
2026-09-15 check could not have had: `a39-research.md` (written 2026-09-23)
independently confirms the CORPUS claim's core weakness (no second reader)
from outside this row entirely, and narrows what a redesign should actually
claim (provenance, not memory).

---

## 8. Wave plan - conditional, not dispatchable as written

**This section is deliberately not a dispatch-ready plan.** Per
`docs/loop/leverage.md:110-121`, the disposition among Redesign / Accept the
cost explicitly / Reject is "decided by the human who scoped it, never
defaulted by the agent" - and section 6 above shows the plain "Redesign:
persist as CORPUS" reading does not survive `a39-research.md`. This document
does not pick for the owner. What follows is the wave shape **if** Redesign
is chosen, scoped only so the next pass does not start from zero; it is
blocked on the escalation in section 9.

**Wave 0 - owner decision (not an agent wave).** One batched question,
alongside other backlog work per `AGENTS.md`'s never-stall rule: does the
owner want (a) a real second reader built (the provenance-narrowed claim
from section 6, e.g. a facts-to-answer link the instructor can later view
next to the course's *current* facts, showing what changed) - the only
reading that survives as CORPUS; (b) accept the cost explicitly - persist
as a "past answers, same device/session" convenience with no leverage claim
beyond click-savings on re-asking, sized against section 2's finding that
badly-placed read-back costs more than re-asking; or (c) reject, and close
the row. This document recommends (a) if the owner is willing to accept the
new-table-plus-new-surface cost in Wave 1-2 below, because it is the only
option that produces a checkable claim rather than a benefit statement, but
this is a recommendation, not a default.

**Wave 1 - storage (only dispatchable once Wave 0 answers "a" or "b").**
Files (new module, not a reuse of `course-intel`'s shape - section 1, 4):
- NEW `supabase/migrations/<timestamp>_ask_ai_answers.sql` - own table,
  `user_id`, `course_id`, `question`, `answer`, `created_at`; no `tier`, no
  `omissions`, no `assembledAt` (AskAiModal has none of those concepts -
  section 1, 3).
- NEW `src/lib/ask-ai/history.ts` - append + list-by-course, modeled on
  `history.ts`'s `service-role client, explicit user_id filter is the real
  tenant boundary` pattern (migration `:91-101`), not on its row shape.
- NEW `src/lib/ask-ai/history.test.ts`.
- MODIFIED `src/app/actions/llm-content.ts` - `askAboutCourseAction` gains
  a persistence call, wrapped so a failed insert never costs the instructor
  the answer already computed (mirrors the existing precedent at
  `src/app/api/course-intel/ask/route.ts:483-503`, which wraps
  `appendCourseIntelAnswer` in `withDeadline`
  (`src/lib/course-intel/fetch.ts:316`) inside
  `persistCrossCourseAnswer` (`src/lib/course-intel/cross-course-persist.ts:97`)
  specifically so a persistence failure does not fail the response). **Watch
  the 79-line headroom from section 5** - prefer the new call be a single
  import plus one `await`, with all logic in the new lib module.
- MODIFIED `src/app/actions/action-guard-coverage.test.ts` - remove
  `askAboutCourseAction` from `PINNED_UNGUARDED` (`:258`) in the SAME
  commit that adds `requireUser()` to the action, or the exact-set test
  goes red (or worse, stays silently inconsistent with the code).

**Wave 2 - the read-back surface (must render and must be called from a
production caller, per the repo's own "assignment must include the wiring
file" trap).** A surface separate from Course Intel's, given section 2's
click-cost finding:
- NEW `src/app/actions/ask-ai-history.ts` - thin `requireUser()`-guarded
  wrapper, mirrors `course-intel.ts`'s shape.
- NEW component (name TBD by the architect seat) rendering past answers for
  ONE course, each with its stored `created_at` and the staleness
  requirement from section 3 (never assert current accuracy).
- MODIFIED `src/app/components/courses/AskAiModal.tsx` - must import and
  render the new component, or Wave 2 ships a capability with no caller
  (exactly the trap this repo has hit before - `docs/loop/traps-*` and this
  brief's own "verify reachability, not just correctness" instruction).
- MODIFIED `src/app/components/CoursesTab.tsx` only if the new surface
  needs data `AskAiModal` does not already receive (e.g. a full course list
  for scope rendering) - not yet known; the architect seat should settle
  this before dispatch, not this document.

**Wave 3 - oracle and guardrails.**
- If the chosen storage is `localStorage` (section 4's third option): a new
  exact-key-set canary, modeled on
  `courseIntelUiState.test.ts:82-98`, in the SAME commit as the new key -
  none exists for `src/app/components/courses/` today (section 4).
- A removal test for whichever leverage claim Wave 0 settles on, per
  `docs/loop/leverage.md`'s removal-test discipline ("state the deletion,
  then trace the assertion") - not designed here; that is the test-author
  seat's job once Wave 0 answers which claim is being built.

---

## 9. Residual register

| # | What is not proven now | Owner | Instrument | Object | Direction of failure | Step |
|---|---|---|---|---|---|---|
| 1 | Which of Redesign/Accept/Reject the owner wants | Repo owner | One batched escalation question (this document's Wave 0) | The A3 disposal itself | Left unrecorded, A3 sits unscoped and a future pass re-litigates the same four 2026-09-15 findings from zero, the exact waste `docs/loop/this-repo.md` warns against | Escalate alongside other backlog work per `AGENTS.md`'s never-stall rule; record the answer in `docs/backlog.yml`'s A3 note |
| 2 | Whether a genuine second reader (provenance) can be designed, or the claim reduces to click-cost only | Repo owner (product decision - `docs/loop/leverage.md:110-121` forbids an agent defaulting this) | Same batched question as #1 | The CORPUS leverage claim | Shipping without an answer risks building Wave 1-2 against a claim `a39-research.md` section 5.5 says should be withdrawn | Same step as #1 |
| 3 | New-table vs. discriminator-column schema choice | `loop-architect` seat, once Wave 0 lands | A schema design pass, weighed against `docs/loop/this-repo.md` section 6 ("migrations auto-apply via GitHub Action on push to main," no local apply/verify) | The persistence schema (Wave 1) | An unreviewed migration auto-applies straight to production with no local rollback path if the wrong shape is chosen | Architect pass, before any implementer wave, checked by a fresh peer per `docs/DEV_LOOP.md` |
| 4 | `llm-content.ts` headroom at the moment Wave 1 actually starts | Whoever writes Wave 1's dispatch brief | `@(Get-Content src/app/actions/llm-content.ts).Count`, re-run immediately before dispatch (921 measured today, other concurrent backlog items may also touch this file) | `src/app/actions/llm-content.ts` | An implementer wave that inlines persistence logic here instead of a one-line call can cross `LIMIT = 1000` (`file-size-ceiling.structure.test.ts:41`) and fail the wave gate | Re-measure at wave-plan time; keep new logic in the new lib module, not inline |
| 5 | No exact-key-set canary exists for `src/app/components/courses/`'s `ta-` keys | Test-author seat scoping Wave 3 | A new ordinal canary modeled on `courseIntelUiState.test.ts:82-98` | Whichever `ta-` key Wave 1/3 introduces, if `localStorage` is chosen | A future refactor could silently rename or drop the key with nothing going red - the same class of miss `docs/loop/this-repo.md` section 3 documents for the `ta-rec-*` set | Write the canary in the SAME commit as the new key |
| 6 | `askAboutCourseAction`'s guard-pin removal | Wave 1's implementer | `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts` | `PINNED_UNGUARDED` array, `action-guard-coverage.test.ts:236-263` | Adding `requireUser()` without removing the pin leaves the exact-set test red, or (if silently left in place while the guard is added) an inconsistency between the pin's claim and the code | Remove the entry in the same commit as the guard, verified by the named test |
| 7 | The click-cost figures in section 2, and `loadHistoryOpen()`'s default-collapsed behavior | Repo owner or a future manual/browser check | Manual verification in a real browser session (no component renders under vitest - `docs/loop/this-repo.md` section 2) | The click-cost claim underpinning section 2 and the Wave 2 design preference | If the real default or click path differs from what the source implies, Wave 2 is scoped against a wrong cost model | Confirm in-browser before treating section 2's numbers as final |

---

## 10. Gates run over this document

`npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`
run from the repo root in PowerShell, output redirected to
`$env:TEMP\claude\a3-gate-output.txt` and `$LASTEXITCODE` written to
`$env:TEMP\claude\a3-gate-exit.txt`, then both files read back (not piped).
`Get-Content $env:TEMP\claude\a3-gate-exit.txt` returned:

```
0
```

`Select-String -Path $env:TEMP\claude\a3-gate-output.txt -Pattern
"COVERED|NOT COVERED"` returned two lines, no `NOT COVERED`:

```
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
```

`git status --short`, run immediately after, returned exactly:

```
 M docs/css-orphans.md
?? docs/a3-scope.md
```

`docs/css-orphans.md` was already modified before this pass started (present
in the session's own starting `git status` snapshot) and was never opened or
written by this pass - confirmed by it not appearing in any Read/Write/Edit
call above. `docs/a3-scope.md` is this pass's entire write set, matching the
brief's instruction exactly: one new file, nothing else.
