# A3 re-scoped: PROVENANCE, not recall - REVISION 2 (TERMINAL)

Binding premise: `docs/owner-decisions-2026-09-23.md:252-263`, DECISION 11.
Recall is dropped as the goal. The row's value rests on one sentence a chat
cannot produce: **which recorded facts were sent with this question, and which
of them have changed since.** The retrieval interaction is part of the
deliverable, not a follow-up (`owner-decisions-2026-09-23.md:258-261`).

**This is revision 2 and there is no revision 3** (`AGENTS.md`, "Two rounds,
then ask"; `docs/loop/iteration-caps.md:45-60`). It applies rulings 43 to 48 of
`docs/a3-provenance-rulings.md` (commit `abd9278`) over revision 1 (`8e1877c`),
which `docs/a3-provenance-check.md` returned NOT BUILDABLE. Everything this
revision could not settle is either a residual in section 9 (each with an
owner, an instrument, an object, a direction of failure and a step) or the one
terminating question in section 11. Nothing below says "to be decided next
round", because there is no next round.

This document supersedes `docs/a3-scope.md` as the scope. That file is NOT
edited and NOT deleted - it is the record of what was measured against the old
premise and why the premise changed. Section 1 is its disposition table.

Read this pass, on today's tree: `docs/a3-provenance-rulings.md`,
`docs/a3-provenance-check.md`, `docs/owner-decisions-2026-09-23.md`,
`AGENTS.md`, `docs/DEV_LOOP.md`, `docs/loop/this-repo.md`,
`docs/loop/leverage.md`, `docs/loop/iteration-caps.md`.

**On citations.** Revision 1 carried a blanket sentence claiming every citation
in it had been opened. RULING 46 strikes it, and it is struck rather than
softened: one cite (`docs/a39-waves.md:1882`) named a line that did not exist in
a 1864-line file, and a blanket claim that is false once is worth less than none
because it stops the next reader checking. There is no replacement claim. Each
citation stands or falls on its own, and every quantity names the command that
produced it at the point it is used.

**What measurement is CLOSED.** The round-1 check re-derived and confirmed: 27
of 55 in both directions with the 28 unread names derived independently rather
than by subtraction; all 21 line counts across three instruments; the
`LIMIT = 1000` guard pin; the nine `ta-` keys; every staleness citation; every
migration citation; the leverage denominators; and section 1's disposition
table. None of it is re-measured here. What IS measured here is only what the
check found wrong or what this revision newly needs.

---

## 0. Revision 1 -> revision 2: disposition of every requirement revision 1 carried

A restructuring that silently drops a requirement is the failure this table
exists to prevent. Every numbered requirement of revision 1 appears exactly
once.

| Revision 1 requirement | Disposition in revision 2 |
|---|---|
| Section 1's disposition table over `a3-scope.md` (nine rows) | **KEPT VERBATIM.** The check audited it and returned no finding. Section 1 below is unchanged. |
| 2.1 "SENT, not USED", and the four-verb ban stated inline | **KEPT as the principle, WITHDRAWN as a second list.** The ban now exists in exactly one place (5.6) and the instrument is AC-6. RULING 44. |
| 2.2 fact families, the 27/55 measurement | **KEPT.** Extended: the 27 property NAMES are now listed, because AC-5 needs them (RULING 47, the sparse-oracle major). |
| 2.3 "what is knowable at call time" | **KEPT, one cite corrected**: `void provider;` is `llm.ts:384`, not `:385`. |
| 2.4 four branches B1-B4 | **KEPT.** B1's treatment changes in 5.3 (RULING 48). |
| 3.1 survey of four hashing idioms | **KEPT and CORRECTED.** A fifth relevant idiom was missed and is added: `SCHEDULE_ANSWER_MARKER`, the provenance sentence B1 already ships. RULING 47. |
| 3.2 the `AskAiProvenance` shape | **KEPT with three fields ADDED** (`question`, `answer`, `includeStudentData`) and one made nullable (`promptVersion`). RULING 43 and the `includeStudentData` major. |
| 3.3 "extract the prompt into a named exported constant in `llm-content.ts`" | **WITHDRAWN as written, KEPT as intent.** A `"use server"` file may not export a constant. The constant moves to a new lib leaf `src/lib/ask-ai/prompt.ts`, which is added to the write set. RULING 45. The enforcer it protected (`promptVersion` being hashable at all) is preserved and strengthened by AC-10. |
| 3.4 "split the write: the action returns provenance, the modal calls a new guarded action to insert it" | **WITHDRAWN.** It routed the provenance record through the browser and stated no cost for doing so. Replaced by 3.5: the write happens inside `askAboutCourseAction`, which becomes guarded. The enforcer it protected was R-GUARD-1 / AC-9 (the `PINNED_UNGUARDED` exact-set pin); that enforcer is KEPT, with its direction of failure inverted and restated as AC-16. |
| 3.4's R-MODEL-1 disposition (a) "pin that `askAboutCourseAction`'s request has no `webSearch` key" | **KEPT as the decision, WITHDRAWN as the instrument.** The pin binds the wrong object; it moves to `src/lib/llm.ts` where the branch lives. AC-11. RULING 47. |
| 3.5 storage: a new table, not `course_intel_answers`; localStorage ruled out | **KEPT.** The column list is now enumerated in full (3.7), because it auto-applies to production. |
| 3.5 line counts and the 79-line headroom | **KEPT and re-budgeted.** The wave plan now MOVES 77 lines out of `llm-content.ts` before adding any, so headroom grows. 3.8. |
| 3.5 the nine `ta-` keys, corrected and handed over | **KEPT.** A-NEXT-KEY, unchanged. |
| 4.1 the click budget | **KEPT, one number corrected**: the precedent is 2 clicks, not "2 clicks plus a tab switch" - the tab switch was counted twice. |
| 4.2 render the panel in `AskAiModal`, verdict visible on open, newest 5 | **KEPT.** The screen-space cost the check names is recorded as R-SPACE-1 with the pre-commitment lifted. |
| 5.2 `updatedAt` is the wrong instrument | **KEPT, one number corrected**: the honest false-positive surface is 26 of 55, not 28 of 55 (`id` is not mutated in place and `updatedAt` is the signal itself). The argument is unaffected. |
| 5.3 states S1-S7 | **KEPT, S4 REPLACED and expanded.** S4 rendered no verdict at all; RULING 48 forbids that. S4 becomes S4a/S4b/S4c, a clock verdict. S6 is now owner-gated (section 11). S2's sentence is reworded (one count, one list). |
| 5.4 `FACTS_SHAPE_VERSION` plus a frozen exact label-set assertion | **KEPT, instrument REPLACED.** The frozen set alone is defeated two ways (the oracle can be updated without the version; a sparse fixture freezes a partial set). Now AC-4 (frozen PAIR) and AC-5 (fixture maximality). |
| 5.6 the forbidden-verb list, scoped to B3 | **KEPT and PROMOTED.** It is now the single list, and the only one. RULING 44. |
| 6 the leverage claim, EARNED denominators, removal test, two concessions | **KEPT.** Restructured so the claim reads the same under either answer to section 11, and the first concession is corrected: striking the stored answer text would now cost the B1 clock verdict (6.3). |
| 7 waves W0-W4 | **KEPT as content, RENUMBERED and RESPLIT** into W0 + W1-W5. Old W1 carried two behaviour-preserving extractions plus new behaviour; they are separated. Mapping in 7.0. |
| 8 AC-1 through AC-9 | **KEPT, renumbered, four rewritten, eight added.** Mapping in 8.0. No acceptance condition is dropped. |
| 9 residuals R-SEQ-1, R-SEQ-2, R-MODEL-1, R-CEILING-1, R-MIG-1, R-UI-1, R-PAGE-1, R-COLLAPSE-1, A-NEXT-KEY, A-LEVERAGE-DOC | **ALL TEN KEPT.** R-SEQ-1's instrument is changed (a grep over `src/`, not a line cite into a concurrently-edited doc) and R-MODEL-1's instrument is moved to `llm.ts`. Five residuals are ADDED: R-SPACE-1, R-PII-1, R-BARREL-1, R-SIG-1, R-S6-ALT. |
| 10 what this environment cannot verify | **KEPT.** |
| 11 gates run over this document | **KEPT**, re-run for this revision. |
| "Every citation below was opened this pass" | **STRUCK.** RULING 46. No replacement claim. |
| `docs/a39-waves.md:998` and `:1882` | **STRUCK as citations.** See 3.1; A39's artifacts are held by concurrent agents and their line numbers move within a single day, so this document now cites them by grep pattern only. |

---

## 1. Disposition of everything `docs/a3-scope.md` required

Unchanged from revision 1. The round-1 check audited this table and returned no
finding against it.

| Prior requirement | Where it was | Disposition |
|---|---|---|
| The four 2026-09-15 check items (contamination, row shape, read-back must be a server action, auth-guard pin) | a3-scope.md section 7 | **KEPT in substance, three of four re-routed.** Contamination and row-shape are now MOOT-BY-DESIGN (a new table, no `course_intel_answers` reuse) and recorded as the REASON for that choice, not as open items. "Read-back must be a server action" is KEPT and satisfied by W4's guarded read action. The auth-guard pin is KEPT as R-GUARD-1 - see 3.5, where its direction changes. |
| Wave 0 - owner decision among Redesign / Accept / Reject | a3-scope.md section 8, residuals 1 and 2 | **WITHDRAWN - discharged.** DECISION 11 answered it (Redesign, around provenance). No enforcer protected it; it was an escalation, and the escalation was answered. |
| Wave 1 - storage (new table, new lib module, persistence call in `llm-content.ts`, pin removal) | a3-scope.md section 8 | **KEPT.** The table is still new; the lib module is still new; the persistence call is in `llm-content.ts` and the pin does move - which revision 1 tried to avoid and revision 2 restores deliberately (3.5). |
| Wave 2 - read-back surface | a3-scope.md section 8 | **KEPT and promoted.** DECISION 11 makes it part of the deliverable, so it is no longer conditional. Now W4, with a measured click budget it must beat (section 4). |
| Wave 3 - oracle and guardrails (`ta-` key canary if localStorage; a removal test) | a3-scope.md section 8 | **KEPT, and the localStorage branch is WITHDRAWN.** localStorage cannot hold this record: the differentiating claim is cross-session and cross-device, and a per-browser key silently answers "nothing changed" on a second device. The `ta-` canary finding survives as a fact (3.9) and is handed to A-NEXT-KEY rather than owned here, because this design adds no `ta-` key. |
| Residual 3 - new-table vs discriminator-column | a3-scope.md section 9 | **WITHDRAWN - decided here.** New table. Reason in 3.7; the `course_intel_answers` migration's own header (`supabase/migrations/20261018000000_course_intel_answers.sql:16-19`) records that it deliberately refused the snapshot precedent, so reusing it is the one option its authors already ruled out. |
| Residual 4 - `llm-content.ts` headroom at wave start | a3-scope.md section 9 | **KEPT, re-measured, and reduced.** Still R-CEILING-1. |
| Residual 5 - no exact-key-set canary for `src/app/components/courses/` | a3-scope.md section 9 | **HANDED OVER to A-NEXT-KEY, with a correction.** The prior scope said three `ta-` keys plus "three more"; the measured count is NINE, and ZERO are pinned by any test (3.9). Not owned by A3, because A3 adds no `ta-` key. |
| Residual 6 - `askAboutCourseAction`'s guard-pin removal | a3-scope.md section 9 | **KEPT as R-GUARD-1.** Revision 1 proposed a shape in which the pin does not move; revision 2 withdraws that shape (3.5) and the pin moves, in the direction the pin's own header says it should. |
| Residual 7 - the click-cost figures are reading claims | a3-scope.md section 9 | **KEPT as R-UI-1 and widened.** Every interaction count in section 4 is a reading claim; nothing renders under vitest (`docs/loop/this-repo.md:113-118`). |
| Sections 1-6 (the measurements and the "as scoped, A3's value rests on memory alone" verdict) | a3-scope.md sections 1-6 | **KEPT as measurements, WITHDRAWN as conclusions.** The verdict was correct against the old premise and DECISION 11 replaced the premise. |

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
usage?; elapsedMs? }` - there is no attribution channel, and no per-fact signal
comes back. Nothing anywhere in this path can say a fact influenced the answer.

**The rule that follows is stated once, in 5.6, and nowhere else.** Revision 1
stated it three times in three non-identical forms, and one of the three was red
against this document's own proposed copy. There is now one rule, one list, one
instrument (AC-6). Do not restate it here or in the wave tables.

The reason the rule exists at all is a live defect, not a style preference:
`AskAiModal.tsx:99-102` already ships "Answers are grounded in this course's own
recorded facts", and `docs/backlog.yml` row A4 records that exact sentence as
overstating what three of its chips do. Shipping that shape inside the feature
whose whole point is honest provenance would be the same defect twice.

### 2.2 The fact families, and where they are assembled

Assembly is one pure function: `renderCourseFacts`
(`src/lib/course-facts.ts:48-135`). Its header states it is "Pure and
DETERMINISTIC: no I/O, no Date.now()/current-time read, no randomness"
(`:4-5`) - which is what makes a fingerprint of its output meaningful at all.
Same `Course` value, same string, forever.

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
(`src/lib/supabase/courses.types.ts:62-253`) declares **55**. Both numbers were
re-derived by the round-1 check in both directions and are not re-measured here.

**The 27 names, listed because AC-5 needs them.** A frozen label-set oracle
taken over a sparse fixture freezes only the labels that fixture happens to
populate, and `line()` at `course-facts.ts:30-34` returns `null` for an empty
value, so `renderCourseFacts` OMITS blank fields. That is exactly how the
existing exact-equality oracle missed A1: `PRE_CHANGE_NO_OPT_IN_OUTPUT` at
`course-facts.test.ts:170` is two labels out of nineteen scalars, and its `toBe`
at `:174` and `:189` stayed green across the addition of three whole families.
So AC-5 pins the fixture itself against this list:

```
python3 -c "import re;s=open('src/lib/course-facts.ts').read();n=sorted(set(re.findall(r'course\.([A-Za-z0-9_]+)',s)));print(len(n));print(', '.join(n))"
  -> 27
  -> assignmentDueRule, breaks, classLengthMinutes, courseCode, courseProject,
     csvData, dayTime, description, email, endDate, githubOrg, gradesDueDate,
     gradesDueTime, institution, integrations, lms, modality, name, repos,
     roster, startDate, term, tests, textbook, topicOutline, weeklyChecklist,
     weeks
```

That 27-of-55 ratio is load-bearing twice below: it is why `course.updatedAt` is
the wrong staleness signal (5.2), and it is why the fingerprint must be
per-field rather than a single digest of the whole row.

### 2.3 What is knowable at the moment of the call, and what is not

| Thing | Knowable at call time? | Where |
|---|---|---|
| The exact fact block sent | YES, it is the argument | `AskAiModal.tsx:55-60`, `llm-content.ts:865` (`courseFacts.trim()`) |
| Which labels the block contains | YES, derivable from the same `Course` by the same pure function | `course-facts.ts:48-135` |
| The question, trimmed | YES | `llm-content.ts:862` |
| The wall-clock instant | YES | `llm-content.ts:873` (`Date.now()`) |
| The prompt template | YES, but it is an inline literal, not a named constant | `llm-content.ts:887-900` |
| Which model answered | **NO - not returned.** `callLlm` ignores its `provider` argument entirely (`llm.ts:384`, `void provider;` - **corrected from revision 1's `:385`**) and delegates to `callGemini`, which resolves `const model = req.webSearch ? getGeminiSearchModel() : getGeminiModel();` at `llm.ts:492`. `getGeminiModel()` is `process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL` (`src/lib/gemini.ts:98-99`; the default literal is `"gemini-3.1-flash-lite"` at `gemini.ts:1`). None of it comes back in `LlmResult`. | `llm.ts:200-202, 375-386, 492` |
| Which facts the answer used | **NO, and never will be** | 2.1 |

### 2.4 Three answer branches, and only one of them sends facts at all

- **B1 - deterministic, no model call.** `llm-content.ts:873-877`. A closed list
  of schedule questions (`matchAskAiQuestionShape`,
  `src/lib/week-numbering.ts:179-184`; the list at `:164-167`) is answered by
  `computeDeterministicScheduleAnswer` (`llm-content.ts:812-837`) from
  `courseDates` - `{ startDate, endDate, weeks }`, passed separately at
  `AskAiModal.tsx:58` - **and from `now`**. The fact block is never read on this
  branch. One of the five UI chips, "What week are we in?"
  (`AskAiModal.tsx:28`), is deliberately a member of that closed list
  (`AskAiModal.tsx:21-27`).
- **B2 - embedded, no model configured.** `llm-content.ts:881-885`. The facts
  are echoed back inside the answer text itself. No model sees them.
- **B3 - the model call.** `llm-content.ts:887-917`. The only branch where the
  fact block is sent to anything.
- **B4 - failure.** `:911` (HTTP), `:915` (empty answer), `:919` (throw). There
  is no answer, so there is no provenance row to write.

**Consequence:** a provenance record needs a branch discriminator, and the read
surface renders different sentences per branch. A B1 row's answer goes stale by
the CLOCK, which no fingerprint of the facts can see - and 5.3 now renders a
verdict for that rather than rendering nothing.

---

## 3. A fingerprint, not a copy

### 3.1 What already exists - surveyed from the tree, not from a design doc

Revision 1 surveyed four hashing idioms and missed the one idiom that is
literally about this feature's subject on this exact code path. RULING 47. It is
row 5 below and it changes the B1 copy design (5.3).

| Idiom | Where | What it is | Durable? |
|---|---|---|---|
| `rubricFingerprint` | `src/lib/research/rubric-bank.ts:28-30` | `createHash("sha256").update(cleanText(text).toLowerCase()).digest("hex")` | **YES** - it is the `rubric_bank` row `id` in the upsert at `:70` |
| `contentHash` | `src/lib/canvas-modules/mappers.ts:68-70` | `createHash("sha1")...slice(0, 16)` | Canvas content change-detection, a different job |
| `hashString` | `src/lib/embedded/scaffold.ts:27-35` | FNV-1a 32-bit, returns a number | Bucketing, not identity |
| `fingerprintScopePages` + `summaryStaleness` | `src/lib/knowledge-overview-stale.ts:57-61` and `:134-173` | A per-item `{id, updatedAt}` LIST persisted at generation time, diffed at read against the live set, producing `{stale, reasons, changedTitles, addedTitles, removedTitles}` | **YES** - persisted as `institution_knowledge_summaries.source_pages` (`supabase/migrations/20261011000000_institution_knowledge_overview.sql:100-106`), read at `src/app/components/knowledge/useKnowledgeOverview.ts:247` |
| **`SCHEDULE_ANSWER_MARKER` - A PROVENANCE SENTENCE THAT ALREADY SHIPS** | literal at `src/lib/week-numbering.ts:191`; appended at `llm-content.ts:784, :787, :789, :797, :800`; pinned positively at `llm-content.test.ts:415` and negatively (on the model branch) at `:423` | Every B1 answer already ends with a sentence saying the answer was computed from the course's own recorded dates and not read or guessed by a model | **YES - shipped, frozen, and tested both ways** |

Row 5 is why 5.3's B1 copy does not restate that claim. Revision 1's S4 proposed
a second, unsynchronised spelling of a sentence the app already emits into the
answer text itself. Revision 2 reuses the constant instead: the panel imports
`SCHEDULE_ANSWER_MARKER` and adds only what the marker does NOT carry, which is
the clock verdict (5.3, RULING 48).

`src/lib/week-numbering.ts` is importable from a client component: its header
states the module is pure with no IO and safe on either side, and it also
records WHY the marker lives there - a `"use server"` file may only export async
functions, so a plain marker constant cannot be exported from
`llm-content.ts`. That is the same constraint as RULING 45 and the same
precedent 3.3 follows.

A39 uses `rubricFingerprint` for exactly this purpose and states the discipline
A3 must copy: both provenance fields "are **read back from the run, never
re-derived from the store**. Editing the stored rubric afterwards cannot change
what a past run reports" (`docs/a39-architecture.md:854-858`).

**Reuse, exactly:** the digest function is `rubricFingerprint`'s body, not a new
one. It must be **imported from a shared leaf, not copied**. A39 plans to move
it into `src/lib/research/rubric-fingerprint.ts` with `rubric-bank.ts`
re-exporting. **A3 must consume that module, not race it.** R-SEQ-1.

**Revision 1 cited that plan by line number and both numbers were wrong.**
A39's artifacts are held by concurrent agents and their line numbers move within
a single day, so this document cites the plan by pattern instead of by line:

```
grep -n "rubric-fingerprint" docs/a39-waves.md          (this pass)
  -> 1179, 1185, 1297, 2911   (4 matching lines)
grep -c "rubric-fingerprintZZZ" docs/a39-waves.md       (canary, valid shape, no match)
  -> 0, exit 1
wc -l < docs/a39-waves.md
  -> 3083
```

Note for the checker of this revision: the round-1 check named today's matches
as `:1179`, `:1253`, `:2911`. Measured this pass the set is `1179, 1185, 1297,
2911` - `:1253` is not among them, and `:1185` and `:1297` are. The file's total
length is identical (3083) in both measurements. I did not reconcile which
reading is right and I am not going to cite either set as a location, because
the disagreement is itself the evidence that a line cite into that file is not a
durable instrument. R-SEQ-1's instrument is a grep over `src/`, where the answer
is a fact about the tree rather than about a document in flight.

**One property of that reuse, named because it is surprising:**
`rubricFingerprint` lowercases and collapses all whitespace (`cleanText`,
`src/lib/embedded/scaffold.ts:23-25`, `text.replace(/\s+/g, " ").trim()`). So a
fact whose only change is casing or whitespace fingerprints IDENTICALLY and will
NOT be reported as changed. For a rubric that is a feature. For A3 it is a
deliberate, documented accepted loss: "Textbook: clean code" to "Textbook: Clean
Code" reads as unchanged. If the architect wants case sensitivity, that is a
DIFFERENT function and it must be named as such, not a quiet second spelling of
this one.

### 3.2 The shape, and why it is a LIST of digests, not one digest

**Recommended shape** (the architect seat owns the final call; this is a
recommendation with its argument, not a default):

```
AskAiProvenance = {
  branch: "deterministic" | "embedded" | "model",
  question: string,                 // the trimmed question this row is about
  answer: string,                   // the answer text the instructor saw
  includeStudentData: boolean,      // the option the sent block was built under
  factsShapeVersion: number,        // bumped when renderCourseFacts's label set moves
  factFingerprints: Array<{ label: string; digest: string }>,   // sorted by label
  factsDigest: string,              // sha256 of the whole sent block
  promptVersion: string | null,     // sha256 of the extracted prompt constant; null on B1/B2
  model: string | null,             // null on B1/B2
  askedAt: string,                  // ISO, app clock
}
```

**Three fields were added in revision 2 and each one closes a named defect.**

- **`question` and `answer` - RULING 43, the blocker.** Revision 1's shape and
  its enumerated column list carried neither, while three other sections of the
  same document required both: 4.2 collapses each row to "the question, the ask
  date, and the verdict"; 4.2's table sells "the text of a past answer" as a
  2-interaction deliverable; and section 6's concession says the stored answer
  exists so the provenance has an object to be about. Every acceptance criterion
  in revision 1 passed anyway - AC-1/2/3/7 exercised a pure diff over fixtures
  the test itself built, AC-5 asserted copy strings, AC-6 was source-text
  wiring, AC-8 a line count, AC-9 a guard pin - so the surface would have
  shipped as five identical lines with no way to tell which question any of them
  was about. **The assertion that would have caught it is AC-7** (two rows
  differing only in `question` must produce two different lines), and the
  assertion that catches the column half is AC-8 (the TypeScript field set
  against the migration's column set). Both are new in revision 2.
- **`includeStudentData`.** The stored set is built by
  `renderCourseFacts(course, { includeStudentData: true })`
  (`AskAiModal.tsx:56`). If the read path recomputes without the option, three
  labels (Roster, Weekly checklist, Grades due) vanish from the current set and
  the removed-branch reports three facts REMOVED on every row - a false sentence
  on every row, with every gate green, and invisible to AC-1 and AC-2 because
  they build both sides inside one test. Recording the option on the row is the
  provenance-correct fix: the row says what was actually sent, and the read path
  recomputes under `row.includeStudentData` rather than under a default. AC-9.
- **`promptVersion` is nullable.** B1 and B2 build no prompt, so a non-null
  string there would be a fabricated value in a provenance record.

Three arguments for the per-label LIST over a single opaque digest, each
checkable:

1. **A scalar digest cannot name what changed.** The differentiating sentence
   DECISION 11 buys is "these facts changed since this answer"; naming them is
   what a chat cannot do, and `knowledge-overview-stale.ts:93-99` already states
   the same reasoning for its own feature: the title lists are "never re-derived
   from a bare count, since a count alone cannot say WHICH pages changed".
2. **It is the repo's established staleness idiom, applied to a different key
   space.** `PageFingerprint` is `{id, updatedAt}`; A3's is `{label, digest}`.
   `summaryStaleness`'s three branches (`:152-158`) transfer one-for-one: a
   label present-then-absent is a fact REMOVED, absent-then-present is ADDED,
   present-in-both-with-different-digest is CHANGED. The delete case its comment
   flags (`:117-122`) is real here too: clearing the Textbook field leaves no
   "changed" signal anywhere except the label disappearing.
3. **Digesting each field, rather than storing it, is what makes this shippable
   at all.** The `course_intel_answers` migration header records that its
   authors saw `institution_knowledge_summaries.source_pages` and **deliberately
   refused to copy it**, because storing the assembled corpus would persist
   per-student material
   (`supabase/migrations/20261018000000_course_intel_answers.sql:9-19`). A3
   sends a Roster block containing student names verbatim
   (`course-facts.ts:110`). Storing a **digest** of the roster keeps the
   staleness signal and stores no name.

**What the digest-only choice costs, stated plainly:** the read surface can say
*that* the Textbook changed and *when* the answer was asked. It **cannot show
the old value**, because the old value was never stored. A39 chose differently -
it carries `rubricUsed` (the full text) alongside the fingerprint
(`a39-architecture.md:853-856`) - and that difference is deliberate here: A39's
rubric is instructor-authored text with no third-party PII; A3's fact block
contains a class roster.

**The one place per-student material can still land is `answer`,** because a B3
model answer may quote roster names back. That is a real consequence of adding
`answer` and it is recorded as R-PII-1 rather than waved past. It is
precedent-consistent - `course_intel_answers` stores `answer_markdown` too - but
the precedent's header refuses the *corpus*, not the *answer*, so the analogy
holds only for the answer column.

### 3.3 The prompt version, and the lib leaf RULING 45 requires

The idiom: `src/lib/slide-prompt.test.ts:210-215` pins a prompt constant by
frozen sha256 plus length, with a comment rule that "every intentional move has
to say what moved it" (`:205-206`). The constant it pins lives in
`src/lib/slide-prompt.ts`, a plain lib leaf.

The blocker revision 1 walked into: the Ask AI prompt is an **inline template
literal inside the function** (`llm-content.ts:887-900`, 14 lines),
interpolating `facts` and `ask`. Revision 1 instructed W1 to extract it into "a
named exported constant" and assigned that edit to
`src/app/actions/llm-content.ts`, whose first line is `"use server"`. A
`"use server"` module may export nothing but async functions;
`src/lib/use-server-exports.test.ts` states the rule and the blast radius in its
header - a plain `export const` compiles clean under tsc, passes every unit
test, and breaks `next build`. The wave could not satisfy its own instruction.

**Revision 2 adds the leaf to the write set:**

- `src/lib/ask-ai/prompt.ts` (new): exports `ASK_AI_PROMPT_TEMPLATE` (the
  invariant text - the preamble at `:887`, the two section headers at `:889` and
  `:892`, and the four requirement lines at `:895-900`) and
  `buildAskAiPrompt(facts, ask)`.
- `src/app/actions/llm-content.ts` imports `buildAskAiPrompt` and its prompt
  assignment becomes one line.
- `src/lib/ask-ai/provenance.ts` hashes `ASK_AI_PROMPT_TEMPLATE` directly. A lib
  module importing a value out of a `"use server"` action module would drag that
  module's closure with it, which is the second reason the constant cannot live
  in the action file.

AC-10 pins the constant by frozen sha256 plus length (the `slide-prompt.test.ts`
idiom) AND pins that `llm-content.ts` builds its prompt from it, so the
extraction cannot be quietly reverted into an inline literal.

### 3.4 The deterministic-answer leaf, and what RULING 48 costs

RULING 48 requires the B1 branch to render a verdict rather than nothing, and
names re-running the computation against today's clock as the better answer. The
cost revision 1 did not budget: `computeDeterministicScheduleAnswer` is
module-private in a `"use server"` file, and so are the two renderers it calls,
so none of the three can simply be exported.

**The move, measured:**

```
grep -n "^function renderCurrentWeekAnswer\|^function renderTermEndAnswer\|^function computeDeterministicScheduleAnswer" src/app/actions/llm-content.ts
  -> 782, 795, 812
sed -n '775,837p' src/app/actions/llm-content.ts | wc -l
  -> 63
```

Lines 775-837 (the three functions plus their doc comments) move verbatim into
a new leaf `src/lib/ask-ai/schedule-answer.ts`. `llm-content.ts` imports
`computeDeterministicScheduleAnswer` from it; the two renderers stay
module-private inside the new leaf. Nothing about the answer text changes, which
is what makes this a behaviour-preserving move and lets `llm-content.test.ts`'s
existing assertions - including the `SCHEDULE_ANSWER_MARKER` pins at `:415` and
`:423` - stay exactly as they are and act as the move's own regression check.

The new leaf is pure and importable from the read action (W4), which is what
makes the B1 clock verdict buildable at all. It also imports nothing from
`llm-content.ts`: `matchAskAiQuestionShape`, `currentCourseWeek`,
`courseProgressStatus`, `daysUntilTermEnd` and `SCHEDULE_ANSWER_MARKER` all
already come from `@/lib/week-numbering` (`llm-content.ts:23` closes that import
block), so the move creates no cycle.

### 3.5 Where the write happens - revision 1's split is WITHDRAWN

Revision 1 recommended splitting the write: `askAboutCourseAction` returns
`{ answer, provenance }` to `AskAiModal.tsx` (a `"use client"` component), which
then calls a new guarded action to insert it. The check's finding stands: that
makes the stored record client-supplied, in a feature whose entire value is that
the record is trustworthy, and revision 1 stated no cost for it in a subsection
titled "where the prior scope's cost drops". It is withdrawn.

**Revision 2: the insert happens inside `askAboutCourseAction`.** The action
already holds every input - the trimmed question at `:862`, the trimmed facts at
`:865`, the branch it took, `now` at `:873`, and the answer at its return - so
the record is written in the same server invocation that produced the answer,
with no browser hop.

**Its cost, stated rather than dropped.** `askAboutCourseAction` gains
`requireOwner()` (`src/lib/supabase/auth.ts:451-453`, which delegates to
`requireUser()` at `:328`) and `createServiceClient()` - the idiom at
`src/app/actions/course-intel.ts:33-34` - plus a call into
`src/lib/ask-ai/history.ts`. It therefore leaves `PINNED_UNGUARDED`, and the
exact-set assertion at `action-guard-coverage.test.ts:450`
(`expect(unguarded).toEqual(PINNED_UNGUARDED)`) goes red until that line is
removed in the same commit.

**That is the sanctioned direction, not a regression, and this is the measured
reason.** The list's own header at `action-guard-coverage.test.ts:229-234` reads
"Actions that are still unguarded but SHOULD NOT BE, pinned so the set can only
shrink. Every one of these is reachable by any signed-in account and most spend
the deployment's LLM budget." `askAboutCourseAction` spends the LLM budget and
is exactly such an entry. Removing it shrinks the set, which is the only
direction the pin permits. `PINNED_UNGUARDED` is declared at `:235`, its entries
occupy `:236-263`, `askAboutCourseAction` is at `:258`, and the count is 28
(`sed -n '236,263p' ... | grep -c '^\s*"'` -> 28) - all re-derived by the
round-1 check and not re-measured here. After this wave the count is 27. AC-16.

**The honest limit of the integrity gain, so it is not oversold.** The fact
block is still rendered client-side and passed in as a string
(`AskAiModal.tsx:55-60`), and the action's own header at `llm-content.ts:843-845`
says that is deliberate - the facts are pre-rendered "so this action stays free
of the Supabase row shape". Writing inside the action therefore guarantees that
the record is derived from the same string the model received in the same
invocation; it does not guarantee that the string was a faithful render of the
course. That residual is unchanged by either shape and is out of scope for a
single-tenant instructor app. What the split additionally exposed - a record
that could be written with no answer behind it at all - is closed.

**Blast radius of widening the return type, measured this pass.** Revision 1's
per-file breakdown did not sum to its headline; measured per file it does:

```
for f in $(grep -rln "askAboutCourseAction" src --include=*.ts --include=*.tsx); do echo "$f: $(grep -c "askAboutCourseAction" $f)"; done
  src/app/actions/action-guard-coverage.test.ts: 1
  src/app/actions/llm-content.test.ts:          20
  src/app/actions/llm-content.ts:                1
  src/app/actions/media-likeness.ts:             1
  src/app/components/courses/AskAiModal.tsx:     3
  src/lib/course-facts.ts:                       1
  src/lib/week-numbering.ts:                     2
  src/loop-docs.structure.test.ts:               1
                                          TOTAL 30
grep -rn "askAboutCourseAction" src --include=*.ts --include=*.tsx | wc -l   -> 30
CANARY: grep -rn "askAboutCourseActionZZZ" src --include=*.ts --include=*.tsx | wc -l  -> 0
```

Eight files, 30 hits, and exactly ONE production call site -
`AskAiModal.tsx:55`. The discriminator is `"error" in result`
(`AskAiModal.tsx:62`), so adding a field to the success member is type-safe.

**The field that gets added.** The action returns
`{ answer: string; provenanceStored: boolean }`. `provenanceStored` is what
makes a dropped record visible: combined with 4.2's five-row window, a silently
failed insert would otherwise produce a panel indistinguishable from one where
the instructor never asked, and none of the copy states covers "there is no
record of an answer you saw". The insert must still never cost the instructor
the answer they waited for - a failure is caught, the answer is returned, and
`provenanceStored` is false. S9 in 5.3 renders that. AC-15.

### 3.6 The model, and where its pin belongs

The action can call `getGeminiModel()` itself (`gemini.ts:98-99`) - it is a
server module and the env read is the same read `callGemini` makes microseconds
later in the same process. That is a **re-derivation, not an observation**, and
it is only equal to the truth while the request sets no `webSearch`, because
`llm.ts:492` is `const model = req.webSearch ? getGeminiSearchModel() :
getGeminiModel();`.

Two dispositions, and this document still recommends the first:

- **(a) Re-derive, and pin the assumption.** Record `getGeminiModel()`, and pin
  the branch. **Revision 1 put that pin on the wrong file.** It proposed a
  source-text assertion over `askAboutCourseAction`'s `callLlm` request - but
  the risk does not live at the call site, it lives at `llm.ts:492`. A pin on
  `llm-content.ts` stays green if a later edit adds a second model-selecting
  branch inside `callGemini`, and the stored `model` silently becomes false,
  which is precisely the direction of failure the residual itself names. The pin
  moves to `src/lib/llm.ts`: `webSearch` is the ONLY model-selecting branch
  inside `callGemini`. AC-11.
- **(b) Observe it.** Add `model?: string` to `LlmResult`'s `ok: true` member
  (`llm.ts:201`) and set it in `callGemini`. Strictly more honest. Cost:
  `llm.ts` is the shared leaf for **127 non-test `callLlm(` call sites**
  (`grep -rn "callLlm(" src --include=*.ts --include=*.tsx | grep -v "\.test\." | wc -l`
  -> 127; canary `callLlmZZZNoSuchThing(` -> 0). An optional field is type-safe,
  but `llm.ts` is the highest-traffic shared file this design could touch, and
  `docs/loop/parallel-disjointness.md`'s rule is that a one-line change to a
  shared helper can break forty. Not worth it for this row alone; worth it if
  another row needs it too.

Under (a) the pin is a source-text assertion on `llm.ts`, so `llm.ts` enters
W2's write set as a TEST-ONLY neighbour: the assertion lives in a test file, not
in `llm.ts` itself. R-MODEL-1.

### 3.7 Storage, and exactly what the migration contains

**A new table.** Not `course_intel_answers`. Re-confirmed by the round-1 check
that reusing it still contaminates a shipped surface -
`src/app/actions/course-intel.ts:113` calls
`listAllCourseIntelAnswers(supabase, user.id)` and `:132`
`clearAllCourseIntelAnswers(supabase, user.id)`, both with no course filter and
no feature filter - and the row shape still does not fit
(`AppendCourseIntelAnswerCommon` at `src/lib/course-intel/history.ts:415-431`
requires `citedStudents`, `omissions`, `assembledAt`, `tier: AssemblyTier`, and
`AssemblyTier` is the closed two-member union at
`src/lib/course-intel/types.ts:385`).

**LOCALSTORAGE IS RULED OUT, not deferred.** The claim is "these facts changed
since this answer"; a per-browser key answers "nothing changed" on a second
device because it has no rows there. That is a silently false sentence, which is
the one outcome this design exists to avoid.

**RULING 43 requires the migration's contents to be stated explicitly, because
migrations auto-apply to production from a GitHub Action on push to main with no
local apply step (`docs/loop/this-repo.md:233-235`) and only a lexical gate.**
A missing column is first seen as a red Action after the TypeScript that depends
on it has merged. So the column set is enumerated here, it is enumerated in the
same names and order the TypeScript uses, and AC-8 asserts the two sets against
each other rather than trusting this list.

```
create table if not exists public.ask_ai_provenance (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  course_id            uuid not null references public.course_hub (id) on delete cascade,
  question             text not null,
  answer_markdown      text not null,
  branch               text not null,
  include_student_data boolean not null,
  facts_shape_version  integer not null,
  fact_fingerprints    jsonb not null default '[]'::jsonb,
  facts_digest         text not null,
  prompt_version       text,
  model                text,
  asked_at             timestamptz not null,
  created_at           timestamptz not null default now()
);

create index if not exists ask_ai_provenance_user_course_created_idx
  on public.ask_ai_provenance (user_id, course_id, created_at desc);

alter table public.ask_ai_provenance enable row level security;
-- plus the four per-operation policies, dropped-then-created, following
-- 20261018000000_course_intel_answers.sql:145 onward
```

Each column, with the precedent it follows:

| Column | Nullable | Why, and what it follows |
|---|---|---|
| `id`, `user_id`, `course_id` | no | Verbatim from `course_intel_answers` (`20261018000000_course_intel_answers.sql:106-118`), including both `on delete cascade` clauses. The course cascade is what makes S7 true. |
| `question` | no | RULING 43. `course_intel_answers` has `question text not null` at `:111`. Without it the panel ships identical lines. |
| `answer_markdown` | no | RULING 43. Same precedent, `:112`. Load-bearing for the B1 clock verdict (5.3) and for 4.2's 2-interaction deliverable. R-PII-1. |
| `branch` | no | Free text, NO CHECK constraint, following `tier text not null` and its column comment at `:107-108` of `20261011000000_institution_knowledge_overview.sql` and the `tier` comment in the answers migration: a future value must never make a save fail. |
| `include_student_data` | no | The `includeStudentData` major. The read path recomputes under this value, never under a default. |
| `facts_shape_version` | no | The 5.4 guard. |
| `fact_fingerprints` | no, defaults `'[]'::jsonb` | jsonb array of `{label, digest}`, sorted by label. Empty array on B1/B2, where no block was sent - which is a true statement, not a missing value, so it is not nullable. |
| `facts_digest` | no | sha256 of the whole sent block; the empty-block case digests the empty string, which S3 distinguishes by `fact_fingerprints` being empty rather than by a null. |
| `prompt_version` | **yes** | Null on B1/B2, where no prompt is built. A non-null value there would be fabricated. |
| `model` | **yes** | Null on B1/B2. Free text, no CHECK, same reason as `branch`. |
| `asked_at` | no | The app clock at send time, carried from the run - distinct from `created_at`, the row's own insert time, exactly as `course_intel_answers.assembled_at` is distinct from its `created_at` (its column comment at `:130`). |
| `created_at` | no | Verbatim precedent. |

**Written idempotently** (`create table if not exists`, `create index if not
exists`, `drop policy if exists` before each `create policy`), because the
answers migration's own header records that migrations auto-apply and may
re-run. A consequence of `if not exists` that the implementer must not
discover the hard way: once this table is live, a forgotten column cannot be
added by editing this file - it needs a new migration with
`alter table ... add column if not exists`. That is the second reason the column
list is enumerated here and asserted by AC-8 rather than left to the
implementer.

**Every read, write and delete goes through `src/lib/ask-ai/history.ts` with the
service-role client, which bypasses RLS entirely.** The explicit `user_id`
filter that module applies itself is the real tenant boundary, not the policies -
stated verbatim in the answers migration's SECURITY header
(`20261018000000_course_intel_answers.sql:91-101`), which cites a live
cross-tenant hole of exactly that shape in `src/lib/artifact-templates.ts`'s own
history.

### 3.8 Line counts, the ceiling, and this wave's budget

Measured in revision 1 with all three instruments, because two of them disagree
in this repo by 15 to 138 (`docs/loop/this-repo.md:6-12`), and re-derived by the
round-1 check, which reproduced every one of the 21 numbers exactly. Not
re-measured here.

| File | `@(Get-Content).Count` (mandated) | `wc -l` | `Measure-Object -Line` | Delta (mandated minus Measure-Object) |
|---|---|---|---|---|
| `src/app/actions/llm-content.ts` | **921** | 921 | 791 | 130 |
| `src/app/components/courses/CoursesTable.tsx` | 792 | 792 | 748 | 44 |
| `src/lib/course-intel/history.ts` | 569 | 569 | 530 | 39 |
| `src/app/components/CoursesTab.tsx` | 474 | 474 | 451 | 23 |
| `src/app/components/course-intel/CourseIntelHistory.tsx` | 308 | 308 | 292 | 16 |
| `src/app/components/courses/AskAiModal.tsx` | 152 | 152 | 144 | 8 |
| `src/lib/course-facts.ts` | 135 | 135 | 125 | 10 |

**The ceiling.** `const LIMIT = 1000;` at
`src/file-size-ceiling.structure.test.ts:41`. **This corrects
`docs/loop/this-repo.md:152`, which cites `:30`.** None of the seven files is in
`ALLOWED_OVERAGE` (declared at `:75`). Revision 1's canary for that zero proved
only that grep fires on the file with a plain literal, while the zero it
defended came from a six-way alternation; the canary that actually tests the
alternation shape is below, re-run this pass:

```
grep -c "llm-content.ts\|CourseIntelHistory.tsx\|course-intel/history.ts\|components/CoursesTab.tsx\|courses/AskAiModal.tsx\|lib/course-facts.ts" src/file-size-ceiling.structure.test.ts
  -> 0   (exit 1)
CANARY, SAME ALTERNATION SHAPE, one arm replaced by a string that IS in the file:
grep -c "llm-content.ts\|ALLOWED_OVERAGE" src/file-size-ceiling.structure.test.ts
  -> 2
```

The canary shares the alternation construct with the assertion, so the zero is a
real absence rather than a broken pattern.

**This wave's net effect on `llm-content.ts`, budgeted rather than hoped:**

| Change | Lines | Command behind the count |
|---|---|---|
| MOVE the three deterministic-answer functions out (3.4) | **-63** | `sed -n '775,837p' src/app/actions/llm-content.ts \| wc -l` -> 63 |
| MOVE the prompt template out, leaving one assignment line (3.3) | **-13** | `:887-900` is 14 lines (the literal opens at `:887`, `grep -n "^- Be concise"` -> 900); one line replaces them |
| ADD: two imports for the moved leaves | +2 | read off the two new module paths |
| ADD: `requireOwner()`, `createServiceClient()`, their imports, the history import, and the guarded insert with its try/catch and `provenanceStored` (3.5) | +12 to +16 | estimate, NOT a measurement - it is code that does not exist yet, and it is the only number in this table that is not measured |
| ADD: building the provenance object on three branches | +6 to +10 | same, an estimate |
| **Net** | **about -50, and negative under every arm of both estimates** | |

So the wave is expected to LOWER `llm-content.ts` from 921 toward roughly 870,
not raise it. The two estimates are flagged as estimates; R-CEILING-1 re-measures
with the mandated instrument at dispatch, and AC-17 is the executing gate either
way. The point of budgeting it is that the earlier ceiling worry is now
backwards: the risk to watch is not this file crossing 1000, it is the two new
leaves being under-scoped because the extraction looked free.

### 3.9 The `ta-` key finding, corrected and handed over

This design adds no `ta-` key, so it owns no canary. The prior scope's figure
was wrong and the correction belongs somewhere. Measured in revision 1 and
re-derived by the round-1 check (nine keys at exactly the cited lines, all nine
returning zero, with the check's own per-key loop and the positive canary
`ta-course-intel-history-open` -> 3 hits):

```
grep -rn '"ta-[a-z0-9-]*"' src/app/components/courses --include=*.ts --include=*.tsx | grep -v "\.test\."
  -> 9 keys: ta-courses-sort, ta-courses-columns, ta-courses-column-order (CoursesTable.tsx:50-52);
     ta-weekly-checklist-new-item-kind (WeeklyChecklistCell.tsx:160);
     ta-weekly-checklist-overview-{sort,search,hide-done,pos,size} (WeeklyChecklistOverviewModal.tsx:84-88)
```

`a3-scope.md` said three keys plus "three more". It is nine, and zero of nine
are pinned by any test. The working precedent remains
`src/app/components/course-intel/courseIntelUiState.test.ts:82-83`, an ordinal
key/owner list. A-NEXT-KEY.

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
2. Click a suggestion chip - `AskAiModal.tsx:104-117`; `:112` is `void ask(s)`,
   so the chip both fills and fires.

= **2 clicks, plus a model call.** For a typed question it is 1 click, typing
the question (the box is `useState` at `:44`, NOT persisted - there is no `ta-`
key in this file), then 1 click on Ask (`:124`).

**The measured precedent this design must NOT repeat**
(`CourseIntelHistory.tsx`):

1. Leave the Courses tab, click the Course Intel tab - `src/app/page.tsx:662`
   gates `CourseIntelTab` on `activeTab === "course-intel"`.
2. Expand the history section - it starts collapsed.
   `src/app/components/course-intel/useCourseIntel.ts:120-124`:
   `HISTORY_OPEN_KEY = "ta-course-intel-history-open"` and `loadHistoryOpen()`
   returns `readLocalStorage(HISTORY_OPEN_KEY) === "true"`, i.e. false unless a
   prior visit opened it.
3. Scan an unscoped list: no course filter and no feature filter, newest-first,
   and **no search box** - the props interface at `CourseIntelHistory.tsx:151-165`
   has `entries`, `courseNames`, `loading`, `open`, `onToggleOpen`, `deletingId`,
   `onDelete`, `clearing`, `onClearAll`, `error`, and no `filter`/`search`.
   (`a3-scope.md` cited these props at `:148-160`; they are at `:151-165` today.)

= **2 clicks plus an unscoped scan.** **Corrected from revision 1**, which
totalled the same three steps as "2 clicks plus a tab switch plus an unscoped
scan" and so counted the tab switch twice. DECISION 11's own wording is "a tab
switch plus an expand click plus an unscoped scan" - two clicks. The bar is
still met; the margin is one click smaller than revision 1 claimed.

### 4.2 The design, and its click count

**Render the provenance INSIDE `AskAiModal`, scoped to this one course, with the
verdict visible on open.**

| What the instructor wants | Interactions in this design | Interactions to get it by re-asking |
|---|---|---|
| "Have the facts changed since I asked this?" | **1** - the same "Ask AI" click that opens the modal. The verdict line renders in the modal body. Zero clicks beyond the one they were already spending. | **Impossible.** Re-asking produces a new answer; it cannot tell you the old one is out of date, and it cannot tell you which fact moved. |
| The text of a past answer | **2** - open the modal, expand one row | 2 clicks plus a model call plus latency, and the answer will differ (temperature 0.4, `llm-content.ts:905`) |
| What was sent with a past question | **2** - the same expand | Not available at all |

**So the answer is 1 interaction, and it is an interaction the instructor was
already spending.** It beats re-asking, and on the differentiating question it
beats it infinitely, because re-asking cannot answer it.

**Why it is safe to render the verdict on open.** Nothing is fetched twice and
nothing blocks the question box: the modal already has `course` (the full
`Course` prop, `AskAiModal.tsx:32`), so the read is one server action call on
mount returning the stored rows plus the staleness verdict.

**Scope and bound.** Newest 5 rows for THIS `course.id`, with the count of older
rows stated as text and no pagination in W4 (R-PAGE-1). Rows are collapsed to
one line each: the question, the ask date, and the verdict.

**The uncounted cost, now counted and re-opened.** The panel occupies screen
space between the question box (`AskAiModal.tsx:87-97`) and the answer pane
(`:143-149`) on every open, including the large majority of opens that are
simply "ask a question". Revision 1 pre-committed against the obvious mitigation
(collapsing by default) because that would cost the verdict 2 clicks and
collapse the argument above. That pre-commitment is LIFTED here: it is a shape
decision presented as a copy decision, and it belongs to the UX and architect
seats. R-SPACE-1. What survives the lift as a constraint rather than a
preference: if the panel is ever collapsed by default, section 4.2's
1-interaction claim is void and must be restated, and a persisted open state
inherits the hydration trap (a `localStorage`-seeded `useState` initializer never
shows on reload) and needs a mount effect. R-COLLAPSE-1.

---

## 5. Staleness, and what may honestly be written on screen

### 5.1 The rule this section obeys

A sentence ships only if it holds on **every** branch in 2.4 and **every**
read-time state in 5.3. `AskAiModal.tsx:99-102` is the standing example of what
happens otherwise. Nothing below is final copy - the UX seat owns wording - but
each proposed sentence is stated with the exact state it is legal in, so a
checker can falsify it by naming a state it fails on.

### 5.2 `course.updatedAt` is the wrong instrument, and this is why

`Course.updatedAt: string` exists (`src/lib/supabase/courses.types.ts:252`),
written by the app clock at `src/lib/supabase/courses.row.ts:287`
(`new Date().toISOString()`). Comparing a stored copy of it by string inequality
would be the same shape `summaryStaleness` uses
(`knowledge-overview-stale.ts:156`).

**It is still wrong here.** `updatedAt` moves when ANY of the 55 `Course` fields
changes; `renderCourseFacts` reads 27 of them. **Corrected from revision 1**,
which said 28 fields can change without altering what was sent: two of the 28
are `id` (the primary key, not mutated in place) and `updatedAt` itself (the
signal, not an independent event), so the honest false-positive surface is **26
of 55**. Every one of those 26 would make the app say "these facts changed since
this answer" when not one character of what was sent had moved. The per-label
fingerprint list has no such failure: it is computed from exactly the emitted
output.

`courses.row.ts:285-287`'s own comment records that the dedicated-writer fields
are kept OUT of `toRow` so `updateCourse` cannot wipe them, which means
`updatedAt` is plausibly also UNDER-sensitive on `courseProject` - a field
`renderCourseFacts` DOES read. Wrong in both directions, then. This disposes of
the cheapest-looking design, and it is named here so a later pass does not
rediscover it as an optimisation.

### 5.3 The read-time states, and the sentence legal in each

| State | Condition | What may be said |
|---|---|---|
| S1 | B3 row, stored and current label sets equal, every digest equal | "Asked <date>. <N> recorded facts were sent with this question; none of them has changed since." |
| S2 | B3 row, some labels differ | The changed labels, the added labels and the removed labels are named **in three separate lists with three separate counts**, never rolled into one count. **Corrected from revision 1**, whose single sentence read "<K> of the <N> recorded facts sent with this question have changed since: <labels>" and then also promised to name added and removed - one count over three lists, and an ADDED label was never among the N sent, so it cannot be counted against N. The changed list is counted against N; the added and removed lists carry their own counts and their own wording (`knowledge-overview-stale.ts:152-158`). |
| S3 | B3 row, the block was empty at ask time (`facts` blank, so `llm-content.ts:890` sent the literal `(nothing recorded)`) | "Asked <date>. No recorded facts were available to send with this question." Never a count of zero dressed as a fact list. Distinguished from S1 by `fact_fingerprints` being empty, not by a null. |
| **S4a** | B1 row (deterministic), and re-running the computation with today's clock reproduces the stored answer exactly | `SCHEDULE_ANSWER_MARKER` (the literal the answer already carries, `week-numbering.ts:191`), plus: "Asked <date>. The same question still computes the same answer today." |
| **S4b** | B1 row, and today's recomputation differs from the stored answer | The same marker, plus: "Asked <date>. The same question computes a different answer today, because this answer depended on the date it was asked." |
| **S4c** | B1 row, and today's recomputation returns null (the course's dates have since been cleared or made inconsistent, so the closed-list question no longer computes) | The same marker, plus: "Asked <date>. This answer cannot be rechecked, because the course dates it was computed from are no longer set." |
| S5 | B2 row (embedded) | "Asked <date>. No model was configured, so this question was not answered." No staleness verdict; the row exists so the history is not silently incomplete. |
| **S6** | Row's `facts_shape_version` differs from the current constant | **OWNER-GATED. NOT DISPATCHABLE until section 11 is answered.** Both candidate sentences are specified in section 11; exactly one ships. |
| S7 | Course deleted | No row - `on delete cascade` on `course_id`, following `20261018000000_course_intel_answers.sql:109` |
| **S9** | `provenanceStored` was false for an answer the instructor is looking at right now | "This answer was not recorded, so it cannot be checked later." Rendered under the live answer, not in the history list, because there is no row to render. Closes the dropped-record hole (3.5). |

(There is no S8. S9 is numbered to leave the S1-S7 identifiers stable against
revision 1 and the check, which both reference them by number.)

**RULING 48, applied.** Revision 1's S4 rendered no verdict at all for the B1
branch. That is wrong on a panel where the other states render a verdict:
absence is read as "checked, nothing changed", which is the one false claim the
design exists to prevent and which 5.6's own third bullet forbids as a sentence.
Revision 2 takes the ruling's better option rather than its floor, because 3.4's
leaf move makes the recomputation a pure function call the read action can
already reach: the read action has the course (`getCourse`, `courses.ts:73`) and
a clock, `computeDeterministicScheduleAnswer(row.question, courseDates, now)` is
pure, and the stored `answer` is now on the row. The floor - a bare explicit
negative - remains the fallback if the architect rejects the leaf move; S4b's
sentence degrades to "this answer depended on the date it was asked and no
staleness check applies to it" and AC-12 degrades with it. Either way, something
is rendered. R-SIG-1 carries the fallback.

**RULING 47's missed idiom, applied.** S4a/S4b/S4c do not restate the "computed,
not guessed by a model" claim in new words. The stored answer already ends with
`SCHEDULE_ANSWER_MARKER`, appended at five sites and pinned both positively and
negatively (3.1). The copy module imports the constant and renders it; the only
new words are the clock verdict, which the marker does not carry. AC-6's second
clause pins that there is no second spelling.

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
2. An assertion that cannot be satisfied by updating an oracle alone.

**Revision 1's instrument was defeated two ways and both are fixed.**

- It said the pair must differ "without `FACTS_SHAPE_VERSION` having been bumped
  in the same commit". A vitest test has no access to the commit, so the test
  could only fail on the label set differing, and the cheapest way back to green
  was to update the oracle and leave the constant untouched - which is verbatim
  the failure the criterion named. **Fix: freeze the PAIR.** One assertion
  freezes a literal tuple of `FACTS_SHAPE_VERSION` and the emitted label set, so
  the version line is what has to move to get back to green. AC-4.
- A frozen set taken over a sparse fixture freezes only what that fixture
  populates. **Fix: pin the fixture.** AC-5 asserts the fixture object sets all
  27 properties in 2.2's list, from a frozen literal list of those names.

**No exact label-set oracle exists today**, and that is a measured absence, not
an assumption: the round-1 check re-ran `grep -n "toBe(\|toEqual(\|toContain("`
over `course-facts.test.ts` and confirmed `:182-184` are three `toContain` calls
on the opt-in path, while `toBe` exists at `:142`, `:174`, `:189` and `:333` -
so a `toBe`-shaped pin is findable in that file when one exists, which is the
canary that the absence is real rather than a broken search. `toContain` cannot
detect an added label.

### 5.5 The best moment, stated as the feature's point

S2 is not a caveat this design apologises for. It is the deliverable:
**"Textbook and Schedule of topics changed since this answer"** is a sentence a
chat cannot produce for its own past output, because project instructions and
knowledge can be edited at any time with no record of what was in force
(`docs/a39-research.md:561-567`). The app produces it because the fingerprint
set was written at send time and is read back, never re-derived
(`docs/a39-architecture.md:854-858`).

### 5.6 THE forbidden-claim rule - one rule, one list, one instrument

**This is the only statement of this rule in this document.** Revision 1 stated
it in three non-identical places (an inline four-verb list in 2.1, a three-verb
list in the wave table, and a fourth list in AC-5 with the scoping clause
dropped), and the unscoped version was RED against revision 1's own S4 sentence,
which began with a banned token. RULING 44. The collapse below expresses the
REQUIREMENT rather than banning a token, which is what stops the instrument
firing on a sentence that makes no such claim.

**THE REQUIREMENT.** No sentence this feature ships may claim that the fact
block was delivered to, consumed by, or influential on the model. The only
observable relation is that the block was SENT (2.1). Everything else - what the
model received, read, used, or was grounded in - is unobservable on this path
and must not be asserted.

**THE INSTRUMENT, scoped by construction.** The rule is enforced per SENTENCE,
over the sentences that actually make a claim about the fact block:

1. Split each shipped copy string into sentences.
2. Select the sentences whose lowercased text contains the token `fact`. Those
   are the sentences that make a claim about the fact block; a sentence that
   never mentions the facts cannot overstate what happened to them.
3. In each selected sentence, assert no member of the list below appears, with
   whole-word matching (so `used` does not fire on `caused` or `unused`).
4. In each selected sentence, assert the only relation verb present is `sent`
   (including `were sent`, `was sent`, `available to send`).

**THE LIST, and it is the only one:**

```
"grounded in", "based on", "used", "answered from", "informed by",
"drawn from", "read", "consulted"
```

The scoping is what makes the ban coherent and it is not optional. S4a/S4b/S4c
say "no facts were sent with this question" - a sentence that mentions facts and
whose only relation verb is `sent`, so it passes. The stored `SCHEDULE_ANSWER_MARKER`
text speaks about the course's recorded DATES, not about the fact block, and
does not contain the token `fact`, so it is not selected - which is correct,
because a claim about the deterministic function's own typed inputs IS
observable (`llm-content.ts:812-837`: its only inputs are `question`,
`courseDates` and `now`).

**AC-6 carries a positive canary.** An assertion that a list of strings contains
none of eight patterns is an absence claim, and an absence claim with no canary
proves nothing about whether the detector fires or whether the patterns are
valid. So the test includes a fixture string that is NOT shipped copy - "Asked
May 1. 14 recorded facts were used to answer this question." - and asserts the
same detector flags it. If the detector is broken, that case goes green and the
test fails on it.

**Two more things the app must never say, in any state:**

- "This answer is still accurate." Fingerprints match the INPUTS. Nothing here
  re-validates the answer, and `maxOutputTokens: 2048` at temperature 0.4
  (`llm-content.ts:905`) means a re-ask would not reproduce it anyway.
- "Nothing has changed" on a B1 row. A B1 answer ("we are in week 5") goes stale
  by the clock, and no fingerprint of the facts can see that. **Revision 1
  delivered that forbidden sentence by omission** - rendering nothing where four
  other states render a verdict - and 5.3's S4a/S4b/S4c is the fix.

---

## 6. The leverage question, answered against the mechanism

### 6.1 The claim

**CLAIM (classes: CORPUS, per `docs/loop/leverage.md:37`, compounded with
GUARANTEED, `:42`).** For every Ask AI answer, the app stores, server-side at
send time, a per-label fingerprint set of the exact fact block that was sent,
together with the question, the model id and the prompt-template version. On a
later visit it recomputes the same fingerprints from the course as it stands
now, diffs the two sets, and **names the facts that changed**. The record is
read back and never re-derived from the current course.

**What the instructor does instead today.** Puts the course facts into a chat
project's knowledge and asks there. **What that costs them:** project
instructions and knowledge are editable at any time with no record of what was
in force when a given answer was produced (`docs/a39-research.md:561-567`), so
they cannot answer "is this answer built on facts I have since changed?" for any
past answer - not by scrolling back, because the transcript shows the question,
not the state of the knowledge base at that moment.

**EARNED, not inherited** - measured per `leverage.md:20-27`, which requires
counting how many comparable modules already carry the mechanism for free
(denominators re-derived by the round-1 check):

```
Migration files in the repo:         ls supabase/migrations | wc -l                       -> 108
Of those, files declaring a table:   grep -rln "create table" supabase/migrations | wc -l -> 45
Migrations storing an input fingerprint set for staleness:
  grep -rln "source_pages" supabase/migrations                                            -> 2 files,
  of which only 20261011000000_institution_knowledge_overview.sql DECLARES the column
  (20261018000000_course_intel_answers.sql:18 only MENTIONS it, to refuse it)             -> 1
Migrations declaring a model column:  grep -rn "model text" supabase/migrations           -> 1 file
```

So the mechanism exists in **one** place out of the 45 table-declaring
migrations (108 migration files in total), and the one other table that
considered it refused it on privacy grounds. It is not platform infrastructure;
it is a thing a feature has to build.

### 6.2 The removal test

**STATE THE DELETION:** make the read path recompute the stored fingerprints
from the CURRENT course instead of reading `row.factFingerprints`.

**TRACE THE ASSERTION:** a pure unit test builds a stored row whose fingerprints
were taken from course state X, mutates the fixture course to state Y (one
field), and asserts the reported verdict is `stale: true` with
`changedLabels: ["Textbook"]`. With the deletion, both sides of the diff come
from state Y, so the observed verdict becomes `stale: false, changedLabels: []`.
The assertion's observed value changes, so it is a removal test.

**The signature this depends on, pinned because it is load-bearing and revision
1 left it unstated.** The deletion is only expressible inside the lib if the
pure function takes `(storedRow, currentCourse)` and derives the current side
internally. Under the other plausible signature,
`diff(storedFingerprints, currentFingerprints)`, "use the current course for
both sides" is not a mutation of the lib at all - it becomes a rewrite of the
test's own inputs, which is a tautology, and AC-13 cannot fail for the right
reason. So the signature is fixed here:

```
summarizeAskAiProvenance(row: AskAiProvenance, course: Course, now: number): AskAiVerdict
```

It takes the whole row (so `includeStudentData`, `factsShapeVersion`, `branch`,
`question` and `answer` are all available to it), the live course, and a clock
(so the B1 verdict in 5.3 is computed by the same pure function and is testable
without a real clock). R-SIG-1 records that the architect may rename it but may
not change its shape without re-deriving AC-13.

It is buildable here because the diff is a pure function over typed data, not a
rendered component - the same reason `knowledge-overview-stale.test.ts` exists
and runs today.

### 6.3 Concessions

**Recall is NOT the claim and must not be written into the criteria as one.** A
chat retains its own transcript (`a39-research.md:596-600`: "The app keeps a
record" is "a transcript with extra steps").

**Revision 1's version of this concession is corrected.** It said that if the
owner later strikes the stored answer text, "the claim above survives
unchanged". That is true of the B3 claim in 6.1, which reads and diffs
fingerprints and never touches `answer`. It is NOT true of the whole
deliverable any more: 5.3's S4a/S4b/S4c compare a recomputation against the
stored answer, so striking `answer_markdown` would take the B1 clock verdict
down with it and S4 would fall back to the bare explicit negative. Stating it
precisely: **the CORPUS claim survives striking the answer text; the B1 branch
degrades from a verdict to a disclosure.** That is still the test that the claim
is about provenance rather than memory wearing provenance's clothes - it just
costs one named thing rather than nothing.

**Second concession.** On B1 rows the claim is a different and stronger one
(GUARANTEED: no model was called, already shipped as `SCHEDULE_ANSWER_MARKER`),
and on B2 rows there is no claim at all. The leverage sentence in 6.1 covers B3
only, and the criteria must say so.

### 6.4 How this section survives either answer to the owner question

Section 11 asks what the panel does when the app's own recorded-fact list
changes. The answer moves how OFTEN the B3 verdict is available; it does not
move what the verdict IS, and it does not touch the instrument behind the claim.
Concretely:

- **6.1's claim text is unchanged under both answers.** It describes what
  happens when a stored row and today's course are compared. Under answer (i)
  that comparison is suppressed for rows at an older shape version; under (ii)
  it runs over the labels present in both. The sentence "names the facts that
  changed" is true in both cases for the rows it applies to.
- **6.2's removal test is unaffected under both answers**, because its fixture
  row carries the CURRENT `factsShapeVersion`. S6 is not on its path, so AC-13
  neither passes nor fails differently by answer. This is the specific reason
  the leverage instrument was built on a same-version fixture, and it is stated
  here so the checker can falsify it by finding a version dependence in AC-13.
- **What the answer DOES change is the claim's REACH, and that difference is
  real enough to be the reason this is the owner's call.** Under (i), every bump
  of `FACTS_SHAPE_VERSION` permanently disables the verdict for every row stored
  before it - and A1 already moved the label set once
  (`course-facts.ts:108-131`), with W2 of this plan moving it again by
  construction, so the suppressed state is likely to be the common one rather
  than the rare one. Under (ii), the verdict stays available across bumps for
  every shared label. Section 11 carries the recommendation and the cost of
  being wrong.
- **Nothing else in this document branches on the answer.** The gated items are
  exactly S6 (5.3) and AC-3 (section 8), both marked NOT DISPATCHABLE, plus the
  copy string S6 needs in W4. Everything in W1, W2 and W3 is answer-independent
  and can be dispatched before the answer lands.

---

## 7. Wave plan

Rule obeyed throughout, from this repo's own scar tissue: **a wave's file list
contains the file that CALLS or RENDERS each new export, or the capability ships
dead with every gate green.** The live instance is in this very feature family -
`src/app/actions/course-intel.ts:24-31` records that its per-course
get/export/clear actions "HAVE NO CALLER IN THIS UI ANY MORE".

### 7.0 Mapping from revision 1's waves

| Revision 1 | Revision 2 | Why it moved |
|---|---|---|
| W0 (prerequisite: `rubricFingerprint` must have moved) | W0, unchanged | - |
| W1 (`course-facts.ts`, its test, `ask-ai/provenance.ts`, its test, `llm-content.ts`, its test) | **split into W1 and W2** | W1's contents mixed two behaviour-preserving extractions with new behaviour. The extractions are now W1 and land on their own, with the existing `llm-content.test.ts` assertions acting as their regression check; the record is W2. RULING 45 also adds a file the old W1 could not have contained. |
| W2 (storage) | W3 | The `AskAiModal.tsx` edit leaves it: the write moved into the action (3.5), so storage no longer needs the component. |
| W3 (retrieval surface) | W4 | Gains `src/app/actions.ts` (the barrel) and the S6 copy string is owner-gated. |
| W4 (guards) | W5 | Unchanged in purpose. |

### W0 - prerequisite, not a wave

`rubricFingerprint` must already live in its own leaf module. A39 plans that
move. **A3 must not move it, must not copy it, and must not start W2 until it
has moved.** R-SEQ-1. W1 does not depend on it and may start first.

### W1 - two behaviour-preserving extractions

| File | Action | Why it is in this wave |
|---|---|---|
| `src/lib/ask-ai/prompt.ts` | new | `ASK_AI_PROMPT_TEMPLATE` plus `buildAskAiPrompt(facts, ask)`. A plain lib leaf, because a `"use server"` file may not export a constant (3.3, RULING 45) |
| `src/lib/ask-ai/prompt.test.ts` | new | The frozen sha256-plus-length pin, `slide-prompt.test.ts:210-215`'s idiom |
| `src/lib/ask-ai/schedule-answer.ts` | new | The three deterministic-answer functions, MOVED verbatim from `llm-content.ts:775-837` (3.4). Pure, so W4's read action can reach it |
| `src/lib/ask-ai/schedule-answer.test.ts` | new | Direct tests of the moved functions, which were previously reachable only through the action |
| `src/app/actions/llm-content.ts` | edit | **THE CALLER.** Imports both leaves; the prompt assignment becomes one line; the three moved functions are deleted from it. No behaviour change |

Nothing else. `llm-content.test.ts` is deliberately NOT edited in W1: its
existing assertions, including the `SCHEDULE_ANSWER_MARKER` pins at `:415` and
`:423`, are the evidence that the extraction preserved behaviour, and editing
them in the same wave would destroy that evidence.

### W2 - the record, computed and stored

| File | Action | Why |
|---|---|---|
| `src/lib/course-facts.ts` | edit | Export `FACTS_SHAPE_VERSION` and a pure `renderCourseFactLabels(course, options)` returning the emitted `{label, value}` pairs, so the fingerprint set and the sent string come from ONE traversal and cannot drift |
| `src/lib/course-facts.test.ts` | edit | AC-4 (the frozen PAIR) and AC-5 (fixture maximality) |
| `src/lib/ask-ai/provenance.ts` | new | The `AskAiProvenance` type (3.2), the fingerprint-set builder (consuming W0's module), and `summarizeAskAiProvenance` with the signature pinned in 6.2 |
| `src/lib/ask-ai/provenance.test.ts` | new | AC-1, AC-2, AC-13 (the removal test) |
| `src/lib/ask-ai/history.ts` | new | Append plus list-by-course, service-role client with an explicit `user_id` filter as the real tenant boundary (3.7) |
| `src/lib/ask-ai/history.test.ts` | new | |
| `supabase/migrations/<ts>_ask_ai_provenance.sql` | new | The table, exactly as enumerated in 3.7. **Auto-applies to production on push to main** (`this-repo.md:233-235`); `src/supabase-migrations.structure.test.ts` is the only local gate and it is lexical |
| `src/app/actions/llm-content.ts` | edit | **THE CALLER.** `requireOwner()` + `createServiceClient()`, build the provenance object on all three branches, insert, return `{ answer, provenanceStored }` |
| `src/app/actions/llm-content.test.ts` | edit | Branch coverage for the three provenance shapes; AC-15 |
| `src/app/actions/action-guard-coverage.test.ts` | edit | Remove `askAboutCourseAction` from `PINNED_UNGUARDED` in the same commit that guards it. AC-16 |
| `src/app/components/courses/AskAiModal.tsx` | edit | **THE CALLER.** Consumes `provenanceStored` and renders S9. Without this file the not-recorded state ships dead |
| `src/lib/llm.test.ts` (or the existing test file that owns `llm.ts`) | edit | AC-11, the model-branch pin. `src/lib/llm.ts` itself is NOT edited |
| `src/app/components/courses/askAiProvenanceCopy.ts` | new | S9's string only. The rest of the copy is W4 |
| `src/app/components/courses/askAiProvenanceCopy.test.ts` | new | AC-6 over S9, including the positive canary |

### W3 - nothing

Reserved and deliberately empty, so the wave numbers in this document do not
shift if the architect splits W2. Do not put work here without renumbering the
acceptance conditions that name a wave.

### W4 - the retrieval surface

| File | Action | Why |
|---|---|---|
| `src/app/actions/ask-ai-provenance.ts` | new | The guarded read: takes `courseId`, loads the course with `getCourse(userId, id)` (`src/lib/supabase/courses.ts:73`), calls `summarizeAskAiProvenance(row, course, Date.now())` per row under `row.includeStudentData`, returns rows plus verdicts. One hash implementation, server-side, so nothing new reaches the client bundle |
| `src/app/actions.ts` | edit | **THE BARREL.** `:58` is `export * from "./actions/llm-content";`, which is why W2's widened return type needs no barrel edit - but a NEW action module's exports are not carried until a line is added, and `AskAiModal.tsx:8` imports from `@/app/actions`. tsc catches the omission, so this blocks rather than ships dead; it is listed because the repo's own scar is that a wave's file list must contain the file that calls the new export. **This file is shared with every other concurrent action-touching row; the disjointness ruling on it belongs to the orchestrator, not to this scope.** R-BARREL-1 |
| `src/app/components/courses/AskAiProvenancePanel.tsx` | new | The panel. Renders S1-S7 (5.3) |
| `src/app/components/courses/AskAiModal.tsx` | edit | **THE RENDERER.** Mounts the panel and fires the read on mount. Without this file the panel ships dead |
| `src/app/components/courses/askAiProvenanceCopy.ts` | edit | S1-S7, importing `SCHEDULE_ANSWER_MARKER` from `@/lib/week-numbering` for the B1 states (3.1). **S6's string is OWNER-GATED - see section 11** |
| `src/app/components/courses/askAiProvenanceCopy.test.ts` | edit | One assertion per state; AC-6 over all of them; AC-7; AC-12 |

**W4 is dispatchable except for S6.** If the owner's answer has not landed when
W4 starts, everything but the S6 string and AC-3 proceeds, and the S6 branch
throws a not-implemented error that the panel never reaches for a same-version
row. The wave does not ship until S6 exists.

### W5 - guards

| File | Action | Why |
|---|---|---|
| `src/app/components/courses/askAiProvenance.wiring.test.ts` | new | AC-14. Source-text: `AskAiModal.tsx` imports and renders the panel; the record is written on the success path. `stripComments` first - a regex matches commented-out code (`docs/backlog.yml` row L9) |
| `src/lib/ask-ai/provenance.test.ts` | edit | Sabotage pass: mutate each unit, prove each test can fail |
| `src/lib/ask-ai/shape.structure.test.ts` | new | AC-8: the TypeScript field set against the migration's column set |

### Sequencing and disjointness

W1 -> W2 -> W4 -> W5, strictly. W2 additionally waits on W0.

`src/app/components/courses/AskAiModal.tsx` is edited by W2 and W4 **and by
backlog row A4** (which is `AskAiModal.tsx:16-29` and `:99-102`), so by
`docs/loop/parallel-disjointness.md` A3 and A4 may not run simultaneously. A4 is
three chip strings plus one sentence; it should land first. R-SEQ-2.

`src/app/actions.ts` is the second shared file and it is not A3's to rule on.
R-BARREL-1.

---

## 8. Acceptance conditions

Each names the object under comparison, the instrument producing each quantity,
and the direction of failure.

### 8.0 Mapping from revision 1's AC-1 to AC-9

| Revision 1 | Revision 2 | Change |
|---|---|---|
| AC-1 (no-change verdict) | AC-1 | unchanged |
| AC-2 (one field mutated) | AC-2 | unchanged |
| AC-3 (shape-version mismatch) | AC-3 | **owner-gated**; its pass condition depends on section 11 |
| AC-4 (frozen label set vs oracle) | **AC-4 and AC-5** | rewritten: freeze the PAIR (AC-4) and pin the fixture (AC-5) |
| AC-5 (forbidden verbs) | AC-6 | rewritten: one scoped rule, per-sentence, with a positive canary |
| AC-6 (wiring) | AC-14 | renumbered |
| AC-7 (removal test) | AC-13 | renumbered; its signature dependency is now pinned in 6.2 |
| AC-8 (file-size ceiling) | AC-17 | renumbered |
| AC-9 (guard pin) | AC-16 | **direction inverted**: the pin must SHRINK by one entry |
| - | AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-15 | new in revision 2 |

### 8.1 The conditions

| # | Object | Instrument | Fails when |
|---|---|---|---|
| AC-1 | The stored fingerprint set of one row, against the set recomputed from the same unchanged course | `npm run test:paths -- src/lib/ask-ai/provenance.test.ts` | The verdict is not `stale: false` with empty change lists. Direction: a false-positive staleness claim - the app says facts changed when none did |
| AC-2 | The stored set, against a course with exactly one emitted field mutated | same | `changedLabels` is not exactly that one label, or the added/removed lists are non-empty. Direction: either a missed change (silent, worse) or a wrong label named (visibly false) |
| AC-3 | A stored row whose `factsShapeVersion` differs from the current constant, against today's course | same | **OWNER-GATED, NOT DISPATCHABLE.** Under answer (i): any change list is rendered at all. Under answer (ii): a label absent from either side is reported as a change. Direction under both: the app attributes its own schema change to the instructor's course (5.4) |
| AC-4 | The PAIR `[FACTS_SHAPE_VERSION, emitted label set]` of `renderCourseFacts(MAXIMAL_FIXTURE, { includeStudentData: true })`, against one frozen literal tuple, in ONE assertion | `npm run test:paths -- src/lib/course-facts.test.ts` | The tuple differs from the frozen literal. Direction: the label set moves while the version stays, AC-3's guard goes silently dead, and every pre-move row is diffed against a shape it was never built under. Freezing the pair is what forces the version literal to move to get back to green; freezing the set alone let the oracle be updated instead |
| AC-5 | `MAXIMAL_FIXTURE`'s own populated property names, against the frozen literal list of the 27 names in 2.2 | same | Any of the 27 is absent or empty on the fixture. Direction: `line()` (`course-facts.ts:30-34`) omits blank fields, so a sparse fixture freezes a partial label set and AC-4 is partly dead on arrival - which is exactly how `PRE_CHANGE_NO_OPT_IN_OUTPUT` (`course-facts.test.ts:170`, two labels out of nineteen scalars) stayed green across A1's addition of three whole families |
| AC-6 | Every shipped copy string, sentence by sentence, against the single rule and single list in 5.6; plus one deliberately bad fixture string that is not shipped copy | `npm run test:paths -- src/app/components/courses/askAiProvenanceCopy.test.ts` | A sentence containing the token `fact` contains a forbidden member or a relation verb other than `sent`; OR the bad fixture string is NOT flagged. Direction: the feature ships the exact overstatement A4 exists to fix - or, on the canary arm, the detector is broken and every green result means nothing |
| AC-7 | The two panel lines produced for two stored rows that differ ONLY in `question` | same | The two lines are equal. Direction: the blocker RULING 43 names - the panel ships five identical lines with no way to tell which question any of them is about, with every other gate green |
| AC-8 | The field-name set of the `AskAiProvenance` type in `src/lib/ask-ai/provenance.ts`, against the column-name set parsed out of the `ask_ai_provenance` migration, mapped through snake_case | `npm run test:paths -- src/lib/ask-ai/shape.structure.test.ts` | The two sets are not equal in both directions, ignoring `id`, `user_id`, `course_id` and `created_at`, which the row carries and the type does not. Direction: migrations auto-apply to production on push with no local apply step (`this-repo.md:233-235`), so a field with no column is first seen as a runtime failure after the TypeScript that depends on it has merged |
| AC-9 | The `includeStudentData` value recorded on a row, against the option the read path recomputes under | `npm run test:paths -- src/lib/ask-ai/provenance.test.ts` | A row stored with `includeStudentData: true` is summarised under `false`, or the value is absent from the row. Direction: three labels (Roster, Weekly checklist, Grades due) vanish from the current set and the removed-branch reports three facts REMOVED on every row - a false sentence on every row, invisible to AC-1 and AC-2 because they build both sides inside one test |
| AC-10 | `ASK_AI_PROMPT_TEMPLATE`, against a frozen sha256 and a frozen length; and `llm-content.ts`'s source, against `buildAskAiPrompt` | `npm run test:paths -- src/lib/ask-ai/prompt.test.ts` | Either frozen value differs without the comment saying what moved it (`slide-prompt.test.ts:205-206`'s rule), or `llm-content.ts` no longer builds its prompt from the constant. Direction: `promptVersion` silently stops describing the prompt that was actually sent |
| AC-11 | `callGemini`'s body in `src/lib/llm.ts`, against the assertion that `webSearch` is its only model-selecting branch | `npm run test:paths -- src/lib/llm.test.ts` | A second model-selecting expression appears, or `const model = req.webSearch ? ... : ...` at `:492` is no longer the sole assignment. Direction: the re-derived `model` on the row names a model that did not answer - a provenance record that is itself false. **Revision 1 put this pin on `llm-content.ts`, where the risk does not live**; a pin there stays green through exactly this change |
| AC-12 | The B1 verdict for a row whose stored answer was computed at time T, evaluated at T (expect S4a) and at a T far enough forward to change the week number (expect S4b) | `npm run test:paths -- src/lib/ask-ai/provenance.test.ts` | Either evaluation produces the other state, or the panel renders no B1 verdict at all. Direction: RULING 48 - on a panel where the other states render a verdict, rendering nothing is read as "checked, nothing changed", which is the one false claim the design exists to prevent |
| AC-13 | The removal test's observed verdict, before and after the 6.2 sabotage | `npm run test:paths -- src/lib/ask-ai/provenance.test.ts`, run once with the sabotage applied and once without, from a `cp` backup, never `git checkout --` | The suite stays green with the sabotage applied. Direction: the leverage claim has no instrument behind it. Depends on 6.2's signature: under `diff(stored, current)` the sabotage is not expressible in the lib and this condition becomes a tautology |
| AC-14 | `AskAiModal.tsx`'s source, against the panel import, the panel render, and the S9 render on the not-stored path | `npm run test:paths -- src/app/components/courses/askAiProvenance.wiring.test.ts` | Any is absent (after `stripComments`). Direction: the capability ships dead with every other gate green |
| AC-15 | `askAboutCourseAction`'s return value when the insert throws | `npm run test:paths -- src/app/actions/llm-content.test.ts` | It is not `{ answer, provenanceStored: false }` - either the answer is lost or the failure is invisible. Direction: with 4.2's five-row window, a dropped record makes the panel indistinguishable from one where the instructor never asked |
| AC-16 | `unguarded` against `PINNED_UNGUARDED`, after `askAboutCourseAction` is guarded | `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts` | They differ. The expected motion is the list SHRINKING from 28 entries to 27 in the same commit that adds the guard; the pin's own header (`:229-234`) says the set may only shrink. Direction: if the entry is removed without the guard landing, the coverage test goes red the other way and a budget-spending action is unguarded with the pin claiming otherwise |
| AC-17 | `@(Get-Content src/app/actions/llm-content.ts).Count` against `LIMIT = 1000` | `npm run test:paths -- src/file-size-ceiling.structure.test.ts` plus the PowerShell count | The count reaches 1000. Direction: an innocuous-looking wave turns a shared action file red. Expected motion this time is DOWNWARD (3.8), so an upward move is itself the signal that the extractions did not happen |

**Multi-file runs use the wrapper, one argument per path**, which prints one
`COVERED`/`NOT COVERED` line per argument. Raw `npx vitest run <a> <b>` silently
drops unmatched arguments and exits 0 (`docs/loop/this-repo.md:32-45`). For
example:

```
npm run test:paths -- src/lib/ask-ai/provenance.test.ts src/lib/ask-ai/prompt.test.ts src/lib/course-facts.test.ts src/app/components/courses/askAiProvenanceCopy.test.ts
```

---

## 9. Residual register

| Id | Not proven now | Owner | Instrument | Object | Direction of failure | Step |
|---|---|---|---|---|---|---|
| R-SEQ-1 | Whether A39's move of `rubricFingerprint` into its own leaf has landed | Orchestrator | `grep -rn "export function rubricFingerprint" src` plus `ls src/lib/research/`, with the canary `grep -rn "export function rubricFingerprintZZZ" src \| wc -l` -> 0. **Not a line cite into `docs/a39-waves.md`**: that file is held by concurrent agents and two measurements a few hours apart disagreed on where the pattern matches (3.1) | The shared digest function | A3 copies the body instead of importing it, creating the second fingerprint idiom this design exists to avoid | Check before dispatching W2; if it has not landed, W2 waits. W1 does not depend on it |
| R-SEQ-2 | Whether A4 has landed before A3 W2 | Orchestrator | `git status --short` plus the A4 row's state in `docs/backlog.yml` | `src/app/components/courses/AskAiModal.tsx` | Two concurrent agents in one file; one reverts the other | Land A4 first; it is three strings and one sentence |
| R-BARREL-1 | Whether `src/app/actions.ts` is free for W4 to edit | Orchestrator | `git status --short` plus the write sets of every concurrently dispatched row | `src/app/actions.ts` | A shared barrel edited by two agents; one reverts the other, and the loser's new action module is unexported with tsc green on the winner's tree | Orchestrator rules on it at W4 dispatch. **This scope does not claim it** |
| R-MODEL-1 | Whether re-deriving `getGeminiModel()` equals the model `callGemini` used | `loop-architect`, then W2's implementer | AC-11's source-text assertion **on `src/lib/llm.ts`**, where the branch lives; alternatively option (b) in 3.6 | The recorded `model` value | A stored row names a model that did not answer it - a provenance record that is itself false | Decide (a) or (b) in the architect pass; if (a), the pin ships in W2 |
| R-SIG-1 | Whether the architect accepts `summarizeAskAiProvenance(row, course, now)` | `loop-architect`, before W2 | Re-derive AC-13 against whatever signature is chosen, and check the sabotage is still expressible INSIDE the lib | The pure staleness function's signature | Under `diff(stored, current)` the removal test becomes a rewrite of its own inputs - a tautology - and the leverage claim loses its only instrument (6.2) | Architect pass before W2. Also carries the RULING 48 fallback: if the `schedule-answer.ts` move is rejected, S4 degrades to the bare explicit negative and AC-12 degrades with it |
| R-CEILING-1 | `llm-content.ts` headroom at the moment each wave starts | The dispatch brief's author | `@(Get-Content src/app/actions/llm-content.ts).Count` re-run at dispatch (921 before W1; 3.8 budgets about -50 net) | `src/app/actions/llm-content.ts` | The wave crosses `LIMIT = 1000` (`file-size-ceiling.structure.test.ts:41`) and the gate turns red on a file the wave barely touched. Two of 3.8's rows are ESTIMATES of code that does not exist yet and are labelled as such | Re-measure at W1 and at W2 dispatch; keep all logic in the `src/lib/ask-ai/` leaves |
| R-MIG-1 | That the migration in 3.7 is correct against a real database | Repo owner | The GitHub Action run after the push; locally only `npm run test:paths -- src/supabase-migrations.structure.test.ts`, which is lexical, plus AC-8, which compares two texts and not a live schema | The new table | Migrations auto-apply to production on push to main with no local apply step (`this-repo.md:233-235`); a shape error is first seen as a red Action after the TypeScript that depends on it has merged. `create table if not exists` means a forgotten column needs a NEW migration, not an edit to this one | Architect review of the enumerated column list before W2 dispatch; owner watches the Action |
| R-PII-1 | Whether storing `answer_markdown` is acceptable given that a B3 answer may quote roster names back | Repo owner, with `loop-architect` stating the options | None available here - no database, no model call, and the content depends on what a model returns. The only local instrument is reading `course-facts.ts:110` (the roster is sent verbatim) and the answers migration's own header (`20261018000000_course_intel_answers.sql:9-19`) | The `answer_markdown` column | The design digests the roster precisely so no name is stored, and then stores a model answer that may contain names anyway - a privacy property that reads as guaranteed and is not | Owner decides before W2's migration lands. If struck, 6.3 states exactly what is lost: the B1 clock verdict, not the CORPUS claim |
| R-UI-1 | Every interaction count in section 4 | Repo owner, or a future browser check | Manual verification in a real browser; nothing renders under vitest (`this-repo.md:113-118`) | The 1-click claim in 4.2 and the 2-click precedent in 4.1 | If the real path differs, W4 is scoped against a wrong cost model and DECISION 11's bar is not actually met | Confirm in-browser before treating section 4 as final |
| R-SPACE-1 | What the panel costs the primary task (asking a question) in screen space on every open | `loop-architect` and the UX seat, at W4 | A browser reading; nothing renders under vitest | The modal body between `AskAiModal.tsx:87-97` and `:143-149` | Every open pays for the panel, including the majority of opens that are simply "ask a question". Revision 1 pre-committed against collapsing by default; that pre-commitment is LIFTED (4.2), and if collapsing wins, 4.2's 1-interaction claim is void and must be restated | W4 architect and UX pass, with the pre-commitment lifted |
| R-PAGE-1 | What happens past 5 stored rows for one course | `loop-architect`, at W4 | A row-count assertion in `src/lib/ask-ai/history.test.ts` | The read action's result size | An instructor with a year of answers gets an unbounded list - the unscoped-scan failure this design was built to avoid, rebuilt inside the modal | Decide the bound and the older-rows affordance in the W4 architect pass |
| R-COLLAPSE-1 | Whether the panel is ever made collapsible with persisted state | Whoever proposes it (see R-SPACE-1) | A mount-effect assertion, plus a `ta-` key ordinal canary modelled on `courseIntelUiState.test.ts:82-83` | The panel's open state | A `localStorage`-seeded `useState` initializer never shows the persisted state on reload, and React only warns on the hydration mismatch | Not in W1-W5. If proposed later, it carries both guards |
| R-S6-ALT | The reading of section 11 the owner does NOT choose | Repo owner | None - it is a product decision, and recording it is the whole instrument | S6's sentence and AC-3's pass condition | If the chosen rule turns out wrong in use, the alternative is unrecorded and the next session re-derives the fork from scratch | Record the unchosen reading in `docs/BACKLOG.md` at the push, per `iteration-caps.md`'s "the other reading recorded as a residual" |
| A-NEXT-KEY | Nine `ta-` keys under `src/app/components/courses/` are pinned by zero tests | Whoever next adds a `ta-` key in that directory | An ordinal key/owner exact-set canary modelled on `src/app/components/course-intel/courseIntelUiState.test.ts:82-83` | The nine keys listed in 3.9 | A rename or drop goes unnoticed and a user's persisted state silently resets | **Handed over, not owned by A3** - this design adds no `ta-` key. Belongs in `docs/BACKLOG.md` as its own row |
| A-LEVERAGE-DOC | `docs/loop/leverage.md:98-128` uses `AskAiModal.tsx` as its worked NEGATIVE example ("No persistence... The honest leverage claim here is real but thin") | Whoever lands A3's final wave | `npm run test:paths -- src/loop-docs.structure.test.ts` - `:190-193` asserts the negative-example section still contains `AskAiModal.tsx` AND `askAboutCourseAction` | `docs/loop/leverage.md` | If A3 ships and that card is rewritten, an executing test goes red; if it is not rewritten, the repo's own leverage card describes a feature that no longer exists | **Handed over, not owned by A3** - not in A3's write set. Record as a row so the card and its guard move together |

**Nothing above is a deletion.** Each names an owner, an instrument, an object, a
direction of failure and a step. Three entries (A-NEXT-KEY, A-LEVERAGE-DOC,
R-BARREL-1) are handovers and say so explicitly, with the receiver and the
obligation named. R-PII-1 names "no instrument available here" rather than
inventing one, which is the honest form for something this environment cannot
measure (section 10).

---

## 10. What this environment could not verify at all

Per `docs/loop/this-repo.md` section 6, stated rather than worked around:

- **No component was rendered.** Every interaction count in section 4, every
  claim about what appears on screen, and the entire screen-space question in
  R-SPACE-1 are reading claims from source.
- **No database.** No `.env` exists. Nothing about the proposed table in 3.7 -
  its index, its RLS policies, the cascade, or whether `create table if not
  exists` behaves as intended on a re-run - was executed. AC-8 compares a
  TypeScript text to a SQL text; it does not touch a schema.
- **No model call.** `GEMINI_API_KEY` is owner-set in Vercel; the `model` value
  3.6 discusses was never observed coming back from a real call, because it does
  not come back at all. R-PII-1's question - what a model actually writes back
  when the roster is in the prompt - cannot be answered here either.
- **No browser.** The app cannot be meaningfully driven without env vars.
- **I did not open A39's in-flight artifacts beyond the one grep in 3.1.**
  `docs/a39-*` is held by concurrent agents and was read, never written - and
  3.1 records why its line numbers are not used as citations.

---

## 11. The one terminating question for the owner

Under `AGENTS.md` "Two rounds, then ask" and `iteration-caps.md:45-60`, this is
the single item two rounds did not settle. It is a product call, not a
measurement - every quantity it touches is already measured. **It is escalated
with a recommendation; this scope does not settle it.**

**When the app's own recorded-fact list changes, what should the panel do with
answers stored before the change?**

- **(i) Refuse all comparison.** S6 reads: "Asked <date>. What this app records
  about a course has changed since, so these facts cannot be compared." Never a
  change list. Safe, and it turns the feature's stated deliverable off for the
  entire pre-change history, permanently, on every bump. A1 already moved the
  label set once (`course-facts.ts:108-131`) and W2 of this plan moves it again
  by construction, so this is likely the common case rather than the rare one.
- **(ii) Compare the labels present in BOTH sets, and say separately that the
  recorded-fact list moved.** S6 reads: "Asked <date>. <K> of the <N> facts sent
  with this question have changed since: <labels>. What this app records about a
  course has also changed since, so some facts cannot be compared." Honest for
  every shared label - a digest comparison is unaffected by the app having
  started recording something else - and the 5.4 trap is confined to ADDED
  labels, which (ii) simply never reports as changes.

**Recommendation: (ii).** Refusing everything makes the deliverable rarer than
the app's own schema churn, which means the feature is dark exactly when an
instructor most wants it - after something changed. **Cost of being wrong on
(ii):** one sentence has to be worded so an added label is never named as a
change, which 5.3's S2 already commits to doing by keeping three lists with
three counts.

**Both answers terminate this activity**, and neither reopens anything else:

| | Under (i) | Under (ii) |
|---|---|---|
| S6's sentence | the (i) text above | the (ii) text above |
| AC-3's pass condition | any change list at all is a failure | a label absent from either side appearing in any list is a failure |
| Everything else in this document | unchanged | unchanged |
| W1, W2, W3, W5 | dispatchable now | dispatchable now |
| W4 | dispatchable except the S6 copy string | dispatchable except the S6 copy string |
| Section 6's claim and AC-13 | unaffected (6.4) | unaffected (6.4) |

The unchosen reading is recorded as R-S6-ALT so the fork is not re-derived by
the next session.

---

## 12. Gates run over this document

Write set: exactly one file, `docs/a3-provenance-scope.md`. Nothing else was
written or edited; `git status --short` is the evidence and it is reported with
the pass rather than transcribed here.

Commands and their results are recorded in the pass report rather than
transcribed into this file, because a document that quotes its own gate output
cannot be re-verified from itself. The gates run: the NUL/non-ASCII byte scan
(`tr -d -c '\000' < docs/a3-provenance-scope.md | wc -c`, plus a non-ASCII byte
scan over the whole file), `npm run test:paths -- src/lib/no-emojis.test.ts
src/source-bytes.structure.test.ts` with the exit code read from a file, and
`git status --short`.
