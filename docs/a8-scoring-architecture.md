# A8 reply-section SCORING round - architecture and design (round 1)

Design only. No production code, no test code, was written or changed to produce
this document. This is the architecture pass for the A8 SCORING round scoped in
`docs/a8-scope.md` (checked SHIP): grade a student's discussion REPLIES against a
dedicated reply section of the rubric, not against the initial-post criteria, and
when the rubric has no reply section EXCLUDE the replies from the initial-post
score and disclose that it happened - in the same change that narrows the
model-facing instructions (RULING A).

Consumer: a `loop-plan`/`loop-implementer` chain. A fresh `loop-checker` gates
this before any consumer acts. Every quantity below names the command that
produced it; every `file:line` was opened in this session (2026-10-05).

## 0. What this pass decides, and what it must NOT re-open

Settled by the owner and carried unchanged (do not re-litigate):

- Replies are graded SEPARATELY, against DIFFERENT criteria - not excluded, not
  merely labelled (owner, `docs/BACKLOG.md:168`).
- ONE RUBRIC WITH A REPLY SECTION - not two rubrics, not an app-side convention
  split (owner, second decision 2026-09-15; `docs/a8-scope.md` section 2).
- Recognition (labelling a reply as a reply) ALREADY SHIPPED on Route A
  (`canvasWorkToEntry` discussion branch, `extraction.ts:372-392`; REGRESSION
  444). This round is SCORING, built on that recognition.
- RULING A: exclusion of replies from initial-post criteria ships IN THE SAME
  CHANGE as the rubric carrying a reply section AND the instructions being
  narrowed. This pass honours that by designing all three as one wave (Wave B).

What this pass DECIDES (the three tensions the scope check surfaced):

- NOTE B (content separation): reintroduce a structured, discussion-only,
  OPTIONAL per-axis content carrier on the entry (section 2). Chosen over
  re-parsing the marker string; the reversal of `a8-architecture.md:131` is
  justified and costed there.
- NOTE A (code-held exclusion): the initial-post axis is scored against a
  content slice that PHYSICALLY CONTAINS NO REPLY BYTES, so a reply can never be
  scored on the initial-post axis regardless of prompt wording or model
  behaviour (section 3).
- NOTE C (cross-route gate): every reply-aware behaviour gates on
  `entry.discussionAxes !== undefined` (ACTUAL structured reply presence), never
  on "the rubric has no reply section", so zip / screen-capture routes emit no
  false disclosure (section 4, with its oracle).

## 1. Measured state of the tree

### 1.1 Sizes (both mandated instruments AGREE; 2026-10-05)

`wc -l <path>` (Git Bash) and `@(Get-Content <path>).Count` (PowerShell) - both
run this session, identical on every file:

| File | wc -l | Get-Content | Role this round |
|---|---|---|---|
| `src/lib/grade/rubric.ts` | 420 | 420 | Wave A: marker parse + axis tag |
| `src/lib/grade/types.ts` | 462 | 462 | Wave A: `RubricCriterion.axis?`, `StudentSubmissionEntry.discussionAxes?` |
| `src/lib/grade/extraction.ts` | 527 | 527 | Wave B: populate `discussionAxes` |
| `src/lib/grade/engine.ts` | 499 | 499 | Wave B: per-axis scoring + gate + aggregate |
| `src/lib/grade/prompts.ts` | 415 | 415 | Wave B: `axisScope` param + disclosure composer |
| `src/lib/grade/parsing.ts` | 334 | 334 | Wave B: READ only (`deriveTotalScore`); no edit expected |
| `src/lib/canvas/grades.ts` | 184 | 184 | READ only (post path already N-score); no edit |
| `src/app/components/grading-recording/RubricInputModal.tsx` | 389 | 389 | Wave C: authoring affordance |
| `src/app/actions/grading.ts` | 977 | 977 | NOT expected to change (R6) |

`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`
(`grep -n "LIMIT" src/file-size-ceiling.structure.test.ts`, 2026-10-05). Every
file above has > 400 lines of headroom; the largest projected edits (engine.ts,
extraction.ts) add well under 100 lines each. Re-measure at build time; the prior
docs' pins drifted (`a8-architecture.md` cited `rubric.ts` at 443, `engine.ts` at
487, `extraction.ts` at 372 on 2026-09-29 - all stale now).

### 1.2 Stale citation in the brief, corrected (measured)

The task brief's NOTE A cites `prompts.ts:83-90` as the rule "deduct for an
absent required behaviour". Opened this session: `prompts.ts:83-90` is the
`praiseRouting` parameter's JSDoc, NOT a deduct rule. The actual deduct rules are
Rules bullets at:

- `prompts.ts:191` - a required FILE NAME missing from the submitted-files list
  "is an explicit rubric violation ... deduct for it accordingly".
- `prompts.ts:193` - "If the assignment instructions state required functionality
  ... A required behavior that is absent from the submission is an explicit
  rubric violation ... deduct for it accordingly and name the specific missing
  behavior in overallComment."

NOTE A's substance is unchanged and correct: `prompts.ts:193` is exactly the rule
that turns the verbatim instructor demand "reply to two classmates" into a
deduction against the initial post. The design below is built on `:193`, not on
the stale `:83-90`. This is recorded so the checker does not chase a citation
that does not say what the brief says it says.

### 1.3 The verbatim instructor demand reaches the model at prompts.ts:165-166

`buildSystemPrompt` (`prompts.ts:56-87`, signature read in full) splices the
instructor's verbatim `assignmentInstructions` at `prompts.ts:165-166`
(`ASSIGNMENT INSTRUCTIONS:\n${assignmentInstructions}`), and the pinned criteria
at `prompts.ts:152-153`. So a design that only edits a Rules bullet is toothless
(NOTE A): the verbatim "reply to two classmates" text at `:165-166` and the
deduct rule at `:193` both survive it. The guarantee must be structural (section
3). I did NOT re-open `grading.ts:806-813` (the brief's cite for where
`assignmentInstructions` originates) because this round does not edit
`grading.ts`; the splice point this design actually binds to (`prompts.ts:165-166`)
is opened and load-bearing.

### 1.4 The engine today (the choke this round changes)

`gradeStudentEntries` (`engine.ts:213-389`, read in full):

- Builds ONE system prompt per batch from ALL criteria
  (`extractRubricCriteria(rubric)`, `engine.ts:232-235`).
- Per entry: `truncateSubmission(content, maxCharsPerSubmission)` once
  (`engine.ts:250-253`), then one `gradeSubmission(...)` call
  (`engine.ts:266-276`). `gradeSubmission` (`engine.ts:41-152`) makes the model
  call, parses, and FINALIZES independently: `deriveTotalScore(parsed.totalScore,
  parsed.rubricAreas)` (`engine.ts:117`) then `scaleResultToPoints`
  (`engine.ts:118-122`).
- `content` is a single flat string. The engine receives NO structured
  initialPost/reply split - that is the NOTE B problem.

`deriveTotalScore` (`parsing.ts:208-236`, opened): trusts a non-empty
`explicitTotalScore`; otherwise sums the `earned/possible` of each
`rubricAreas[]`. This is the aggregate lever for AC-R6 (section 7).

`postCanvasGrades` (`grades.ts:128-143`, opened): one `submission[posted_grade]`
from the aggregate `grade` string (`:130`), plus one
`rubric_assessment[<criterionId>]` per `rubricAreas[]` entry whose `area`
name-matches a Canvas criterion (`:134-140`). A reply criterion is simply one
more such area - NO new post plumbing (Fork B, confirmed).

### 1.5 `buildDiscussionEntry` already computes the split (the NOTE B pivot)

`buildDiscussionEntry` (`extraction.ts:304-364`, opened) builds `content` from
the already-split `DiscussionActivity`:

- `initialSectionParts` (`extraction.ts:334-344`) = `=== INITIAL POST ===` + the
  post text, or `[This student did not write an initial post.]` when `I == 0`.
- `replySectionParts` (`extraction.ts:349-356`, only when `R > 0`) =
  `=== REPLIES TO CLASSMATES ===` + per-reply labelled text.
- `content` = `[manifest, initialSection, (replySection)].join("\n\n")`
  (`extraction.ts:346,356,360`).

The two slices ALREADY EXIST as separate strings inside this one function before
they are joined. Surfacing them on the entry is nearly free and introduces no new
cross-module string contract.

### 1.6 The markers are referenced ONLY in extraction.ts

```
grep -rln "INITIAL POST ===\|REPLIES TO CLASSMATES" src     (2026-10-05)
```
returns exactly `src/lib/grade/extraction.ts` and nothing else. So re-parsing the
markers in the engine (NOTE B option i) would ELEVATE these inline literals to a
load-bearing cross-module contract that does not exist today. Keeping them
internal (option ii) is strictly smaller blast radius - this is the measured
argument for section 2's decision, not a preference.

## 2. NOTE B decision (CONTRACT): structured per-axis content on the entry

**DECISION: option (ii). Reintroduce a structured, OPTIONAL, discussion-only
per-axis content carrier on `StudentSubmissionEntry`, populated by
`buildDiscussionEntry` from the slices it already computes (1.5). The engine
reads it; nothing re-parses the marker string.**

This REVERSES `a8-architecture.md:131` ("A new `StudentSubmissionEntry` field for
the reply section ... REJECTED ... a second field splits `content`'s single
source of truth and creates a latent-drop risk for any future entry consumer").
Why the reversal is now correct, and what it costs:

- The prior rejection was made in the RECOGNITION round, where NO consumer needed
  the split. SCORING needs the reply content separately (AC-R3) and needs the
  initial content WITHOUT reply bytes (AC-R4, NOTE A). The premise that made the
  field pointless is gone.
- The feared "latent-drop risk" is now INVERTED. The risk the prior round named
  was "a future consumer reads only `entry.content` and silently drops replies".
  That risk does not apply: `content` is UNCHANGED by this design (still manifest
  + both sections), so every existing `entry.content` reader (truncation,
  display, recognition - REGRESSION 444) behaves identically. The new field is
  ADDITIVE and discussion-only. The real risk today is the OPPOSITE: a consumer
  that NEEDS the split (the scorer) having to re-parse a string, where a marker
  spelling drift (1.6) or truncation-before-parse (1.4) silently collapses two
  axes into one. A typed field cannot drift from its own producer.
- Re-parse (option i) also collides with truncation ORDER: `truncateSubmission`
  runs in the engine (`engine.ts:250`) and is a blind prefix slice; a long
  initial post can cut the `=== REPLIES ===` marker off before any re-parse sees
  it. The structured field is populated pre-truncation in extraction.ts and each
  slice is truncated independently (section 3), so the reply axis never loses its
  content to the initial post's length.

**The contract (what the plan and build consume):**

`StudentSubmissionEntry` gains ONE optional field (`types.ts`, Wave A):

```
discussionAxes?: {
  initialPostContent: string; // self-contained scored content for the initial-post
                              // axis: a code-composed initial-axis manifest line
                              // + the === INITIAL POST === section. CONTAINS NO
                              // reply prose, EVER (the NOTE A guarantee).
  replyContent: string;       // self-contained scored content for the reply axis:
                              // a code-composed reply-axis manifest line + the
                              // === REPLIES TO CLASSMATES === section. "" when R == 0.
  replyCount: number;         // discussion.replies.length - a TypeScript integer,
                              // never model output (the disclosure's count, G-class).
};
```

- `content` (the existing field) is UNCHANGED. It remains the single source of
  truth for truncation, display, recognition, and the single-axis grading path.
- `discussionAxes` is set ONLY by `buildDiscussionEntry` via the
  `canvasWorkToEntry` discussion branch (`extraction.ts:379-392`). Every other
  entry producer (zip ingest, GitHub repos, snapshot, Canvas-assignment) leaves
  it `undefined`.
- Because both `content` and `discussionAxes.*` are built in the SAME function
  from the SAME `work.discussion`, they cannot drift at construction. There is no
  second parse anywhere.

**Cost to the zip path (stated, per the brief):** zero behavioural change and zero
new population. A zip entry has `discussionAxes === undefined`, takes the
single-axis path (section 3), scores against `content` exactly as today, and
emits no disclosure (section 4). The only cost is one optional, usually-undefined
field on a shared interface - which trips no key-count canary (measured, 5.3) and
leaves every current `StudentSubmissionEntry` consumer compiling unchanged
because the field is optional.

## 3. NOTE A: the code-held exclusion / per-axis mechanism (engine.ts)

The load-bearing guarantee: a reply's prose is UNREPRESENTABLE in the content
scored on the initial-post axis. Realised not by a prompt sentence but by WHICH
STRING is concatenated into the model request at `engine.ts:82`.

### 3.1 One per-axis scoring primitive

Refactor the model-call-and-parse half of `gradeSubmission` into a primitive that
scores ONE axis and returns RAW areas without finalising the aggregate:

```
scoreAxis(systemPrompt, student, content, provider, imageFiles, codeRun,
          submittedFiles, commentSplit)
  -> { rubricAreas: RubricAreaResult[]; strengths: string; improvements: string }
```

This is the existing `gradeSubmission` body MINUS `deriveTotalScore` /
`scaleResultToPoints` / `composeOverallComment` (`engine.ts:117-151`). The
single-axis `gradeSubmission` becomes `scoreAxis` once + the existing finalise,
BYTE-IDENTICAL to today for every non-two-axis caller (the non-regression bar;
guard it the way `prompts-praise-routing.test.ts` guards its default branch).

### 3.2 Per-batch setup (gradeStudentEntries): THREE distinct prompts

Computed once per batch from the axis-tagged criteria (section 5). The
commentSplit-derived mode/routing pair is reused for all three prompts and is
BYTE-IDENTICAL to today's call at `engine.ts:233-235` (opened this session):
`commentSplit` true -> `("some", "separate-strengths")`, else the defaults
`("some", "in-overall-comment")`. Call this pair `(mode, routing)` below.

- `criteria = extractRubricCriteria(rubric)` (now axis-tagged).
- `initialCriteria = criteria.filter(c => c.axis !== "reply")` (default +
  "initial-post" both count as initial).
- `replyCriteria = criteria.filter(c => c.axis === "reply")`.
- `hasReplySection = replyCriteria.length > 0`.
- **`singleAxisPrompt`** (the `discussionAxes === undefined` branch - today's
  path): `buildSystemPrompt(assignmentInstructions, rubric, criteria, mode,
  routing, "all")` - over ALL `criteria`, `axisScope` `"all"`. This reproduces
  `engine.ts:233-235` EXACTLY (section 6.1: `axisScope "all"` is byte-identical to
  omitting it). It is a DISTINCT prompt from `initialAxisPrompt` - it is NOT the
  filtered one, and it MUST exist so the undefined branch scores every criterion,
  including any reply-axis criteria, exactly as `extractRubricCriteria`'s flat
  list does today.
- **`initialAxisPrompt`** (the discussion initial-post pass): `buildSystemPrompt(
  assignmentInstructions, rubric, initialCriteria, mode, routing,
  "initial-post-only")` - over the FILTERED `initialCriteria`.
- **`replyAxisPrompt`** (the discussion reply pass): `hasReplySection ?
  buildSystemPrompt(assignmentInstructions, rubric, replyCriteria, mode, routing,
  "reply-only") : null`.

All three are pure functions of the batch inputs, built once. The choice between
`singleAxisPrompt` and `initialAxisPrompt` is made PER ENTRY (3.3), not per batch -
see 3.6 for why this per-entry selection is the correctness-critical part. Do NOT
collapse `singleAxisPrompt` and `initialAxisPrompt`: that collapse is the round-1
blocker (a reply-section-marker rubric on a non-discussion route would silently
drop its reply criterion from the REQUIRED RUBRIC AREAS list at
`prompts.ts:152-153`, lowering the student's max score vs today).

### 3.3 Per-entry dispatch (the gate is `discussionAxes`, NOTE C)

```
const axes = entry.discussionAxes;
if (axes === undefined) {
  // zip / assignment / GitHub / screen-capture, AND any discussion participant
  // whose work.discussion is unset (3.6): TODAY'S PATH, unchanged.
  // one scoreAxis over full `content` with ALL `criteria` using singleAxisPrompt
  // (NOT initialAxisPrompt), then finalise. NO disclosure.
  // (NOTE C: NO-OP on every route without separable replies.)
} else {
  // discussion with structured axes present.
  const initial = scoreAxis(initialAxisPrompt, student,
                            truncate(axes.initialPostContent, cap), ...);
  let areas = initial.rubricAreas;
  let disclosure = "";
  if (hasReplySection && axes.replyCount > 0) {
    const reply = scoreAxis(replyAxisPrompt, student,
                            truncate(axes.replyContent, cap), ...);
    areas = [...initial.rubricAreas, ...reply.rubricAreas];
  } else if (!hasReplySection && axes.replyCount > 0) {
    // EXCLUSION: axes.replyContent is NEVER passed to any scoreAxis call,
    // so reply prose is unrepresentable on the initial-post axis (G1).
    disclosure = composeReplyExclusionDisclosure(axes.replyCount);
  }
  // FINALISE ONCE over the merged areas (section 7).
}
```

Key properties:

- The initial-post axis is ALWAYS scored against `axes.initialPostContent`, which
  by construction (2, 1.5) contains no reply prose. This holds in BOTH the
  two-axis and the exclusion case. The guarantee is structural: there is no code
  path that concatenates reply prose into the initial-post request.
- Each slice is truncated INDEPENDENTLY with the existing `truncateSubmission`.
  The front-loaded per-axis manifest (section 2 contract) means the distinction
  survives truncation on each slice, exactly as the shipped recognition manifest
  does (`a8-architecture.md` 3.3).
- A two-axis grade is TWO model calls per student. This is FORCED by the
  guarantee, not a preference: if reply prose must be absent from the initial-post
  scoring context AND reply criteria must be scored against reply prose, the two
  contents cannot share one prompt. The single-call alternative (one prompt with
  both contents segmented) is REJECTED because it reintroduces reply bytes into
  the initial-post context, defeating G1. Cost is bounded to the explicitly
  two-axis discussion grade - the feature the owner asked for; exclusion and
  every non-discussion route stay one call.

### 3.4 Reply section present but the student made zero replies

`hasReplySection && axes.replyCount === 0`: do NOT call the model on empty reply
content (it would invite the model to invent reply quality from nothing).
RECOMMENDED reading (stated as a contract for the test-author, flagged residual
RS-1 if the owner wants otherwise): emit each reply-axis criterion as a
code-composed absent-reply area (e.g. score `0/<points>` with a fixed
"No replies were submitted" comment), so "no replies" and "no initial post" read
differently in the scored output (scope section 5 item 4). This is pure,
model-independent, and testable without a live call.

### 3.5 Non-regression oracles for the single-axis path (round-2 addition)

The round-1 check found that a reply-section-marker rubric on a NON-discussion
route fell between every stated oracle (AC-R2 exercises only no-marker rubrics;
AC-R6's failure direction was scoped to "no-reply-section, non-discussion"; AC-R3/
AC-R4 object only on discussion entries). These two owned oracles (Wave B, in the
engine's test file) close that gap and pin that `singleAxisPrompt` is distinct
from `initialAxisPrompt`:

- **AC-R2b (ALL criteria scored on a non-discussion route, even with a marker).**
  Object: the system prompt and required-areas list produced for a
  `StudentSubmissionEntry` with `discussionAxes === undefined` graded against a
  rubric that CONTAINS a reply-section marker (so `replyCriteria.length > 0`).
  Instrument (NEW): a unit test asserting the prompt sent for that entry is
  `singleAxisPrompt` - its REQUIRED RUBRIC AREAS list (`prompts.ts:152-153`)
  contains EVERY criterion including the reply-axis one, and its `axisScope` is
  `"all"` (no scope-out directive, section 6.2). Direction of failure: RED if the
  reply-axis criterion is missing from the required-areas list, or the scope-out
  directive appears - i.e. if an implementer reused `initialAxisPrompt` for the
  undefined branch. This is the exact oracle for the round-1 blocker.
- **AC-R2c (both commentSplit modes byte-identical on the single-axis path).**
  Object: `singleAxisPrompt` for `commentSplit` true and false. Instrument (NEW):
  a unit test asserting it equals, byte for byte, today's `engine.ts:233-235`
  output for the same `(assignmentInstructions, rubric, criteria, commentSplit)` -
  `("some", "separate-strengths")` when split, defaults otherwise. Direction of
  failure: RED if the single-axis prompt differs in any byte from the pre-feature
  call for either mode.

### 3.6 Per-entry selection, and the batch-homogeneity invariant (round-2 corollary)

The three prompts (3.2) are built once per batch, but the choice of WHICH prompt a
given entry uses is made PER ENTRY on `entry.discussionAxes === undefined` (3.3).
This is the correctness-critical decision and it is deliberately per-entry, not
per-batch:

- Computing a single batch-wide `axisScope` would be correct only under an
  UNSTATED invariant that a batch is HOMOGENEOUS in `discussionAxes` presence.
  That invariant happens to hold for today's per-source callers
  (`gradeSubmissions`/`gradeEntries` -> no entry has `discussionAxes`;
  `gradeCanvasUrl` on a discussion -> every `work` carries `work.discussion`,
  `engine.ts:482-485`), but it is fragile and nothing enforces it.
- The DEGENERATE case that breaks a per-batch assumption: a discussion participant
  whose `work.discussion` is unset (e.g. a participant Canvas returned with no
  activity) yields an entry with `discussionAxes === undefined` inside an otherwise
  all-discussion batch. Per-entry selection handles this correctly - that entry
  takes `singleAxisPrompt` (all criteria, today's path) while its siblings take
  `initialAxisPrompt`/`replyAxisPrompt`. A per-batch `axisScope` would misgrade it.
- DECISION: per-entry selection (safer, no invariant to maintain). State the
  invariant only to record WHY per-batch would be wrong; do not rely on it.

## 4. NOTE C: the cross-route gate and its oracle

### 4.1 The precise gate condition

Every reply-aware behaviour is gated on a single boolean computed from STRUCTURED
data on the entry, never from the rubric shape alone:

- Score two axes  <=>  `entry.discussionAxes !== undefined && replyCriteria.length > 0`
- Exclude + disclose  <=>  `entry.discussionAxes !== undefined &&
  replyCriteria.length === 0 && entry.discussionAxes.replyCount > 0`
- Everything else (incl. every entry with `discussionAxes === undefined`): the
  single-axis path, NO disclosure.

`discussionAxes` is set ONLY on the Canvas discussion route (2). A zip or
screen-capture submission - which never had separable replies - has
`discussionAxes === undefined`, so BOTH reply branches are unreachable for it and
the disclosure can never fire. The gate is therefore a NO-OP on exactly the
routes the brief names. Gating on "the rubric has no reply section" instead would
fire the disclosure for EVERY zip submission graded against an ordinary rubric -
the false-disclosure regression. This design makes that unrepresentable.

### 4.2 The disclosure is a pure, code-composed function

```
composeReplyExclusionDisclosure(replyCount: number): string   // in prompts.ts (Wave B)
```

Fixed wording, fixed condition, composed from the integer `replyCount` - the same
class as `RESUBMIT_NOTICE` / `UNGRADED_NOT_ATTEMPTED_MESSAGES` / `composeOverallComment`
(`types.ts`, imported at `engine.ts:10-13`). It survives the model returning an
empty string because it is INPUT-independent of the model. It is appended to the
feedback by the engine's finalise step, never authored by the model.

### 4.3 THE ORACLE (names the thing that catches a false disclosure)

AC-R4's false-disclosure guard is a frozen unit test (owned, Wave B, in the
engine's or a pure leaf's test file):

- **Object:** the feedback produced for a NON-discussion entry
  (`discussionAxes === undefined` - a zip-shaped `StudentSubmissionEntry`) graded
  against a rubric with NO reply section.
- **Instrument (NEW):** a pure-function unit test. Because the disclosure
  predicate and `composeReplyExclusionDisclosure` are pure (4.1, 4.2), the test
  needs no model call and no render - it asserts on the composed feedback string
  and on the predicate directly.
- **Direction of failure:** RED if the feedback contains the disclosure sentence
  (or the predicate returns true) for an entry whose `discussionAxes` is
  undefined. This is the exact test that goes red if a later change swaps the gate
  to "rubric has no reply section". Pin the disclosure wording as a frozen literal
  so the oracle cannot be disarmed by a reword.

A complementary POSITIVE oracle (same file): a discussion entry
(`discussionAxes` set, `replyCount > 0`) graded against a no-reply-section rubric
DOES carry the disclosure, and the initial-post request string DOES NOT contain
the reply prose (the NOTE A structural assertion - search the composed
initial-post content for a sentinel string planted only in the reply text and
assert it is absent). RED if reply prose appears in the initial-post request, or
the disclosure is missing.

## 5. The rubric parser + axis field (Wave A)

### 5.1 The marker convention (hardened from a8-architecture section 9)

A REPLY-SECTION MARKER is a line whose trimmed, lowercased text begins with
`replies` or `reply section` AND carries NO `(... pts|points|%)` parenthetical.
It is unambiguous against both criterion matchers because both REQUIRE a
`(number unit)` group (`rubric.ts:43` strict, `rubric.ts:103` widened), which the
marker forbids - so a criterion line can never be read as a marker, and a line
that starts with "reply" but IS a criterion (e.g. `Reply quality (10 pts):
...`) has a parenthetical and is correctly parsed as a criterion, not a marker.
Expose the recognizer as a named helper `isReplySectionMarker(line: string):
boolean` in `rubric.ts` so the authoring surface (Wave C) can share it (8.2,
anti-drift).

### 5.2 Threading the axis through BOTH matcher passes

`extractRubricCriteria` runs STRICT first and reaches WIDENED only when strict
recovers zero (`rubric.ts:27-31`). The marker and axis tagging must be applied in
the SAME per-line loop of BOTH `extractRubricCriteriaStrict` (`rubric.ts:36-55`)
and `extractRubricCriteriaWidened` (`rubric.ts:97-115`), each maintaining a
`currentAxis` that is flipped to `"reply"` when `isReplySectionMarker(line)` is
true (checked BEFORE the criterion match, and `continue`-ing so the marker line
is never pushed as a criterion). Each pushed criterion is tagged with
`currentAxis`.

**AC-R2 non-regression (exact):** when NO marker appears anywhere in the rubric,
`axis` is LEFT ABSENT (field undefined), so a no-marker rubric parses to the
byte-identical `{ name, points }` set it does today. Only a rubric that CONTAINS
a marker gets `axis` populated: criteria before the marker tagged
`"initial-post"`, criteria after it `"reply"`. This keeps the frozen oracle over
existing `rubric.test.ts` fixtures exactly equal (no new key appears), and the
engine filters (`c.axis === "reply"` vs `c.axis !== "reply"`) behave correctly for
both the undefined and the "initial-post" case.

### 5.3 The axis field and the consumer intersection to verify

`RubricCriterion` (`types.ts:458-462`) gains `axis?: "initial-post" | "reply"`
(OPTIONAL). The precise consumer intersection the plan must confirm compiles
unchanged:

- **Key-count canary:** NONE exists.
  `grep -rln "RubricCriterion" src --include=*.structure.test.ts` (2026-10-05)
  returns nothing - no structure test enumerates `RubricCriterion` keys, so an
  optional-field addition trips no field-count canary.
- **The 33-file `RubricCriterion` / `extractRubricCriteria` consumer set**
  (`grep -rln "extractRubricCriteria\|RubricCriterion" src | wc -l` = 33,
  2026-10-05; full list pasted in section 10). Optional `axis` keeps every one of
  these compiling. They must stay green under full `npm test`.
- **Source-text readers of the edited files** (`grep -rln "readFileSync" src |
  xargs grep -l "grade/rubric\|grade/engine\|grade/prompts\|grade/types\|grade/extraction"`,
  21 files, pasted in section 10). Each reads an edited file AS TEXT, so a correct
  change can turn one red. The plan intersects each against the per-wave write set
  with `sort | uniq -d` and pastes the result - this list is the INPUT to that,
  not a substitute (R-AXIS-BLAST).

## 6. Per-axis scoring prompt + instruction narrowing (prompts.ts, Wave B)

### 6.1 `axisScope` - a sixth optional trailing param to buildSystemPrompt

`buildSystemPrompt` today takes five params, the last two optional with
byte-identical defaults (`scoringInstructionMode`, `praiseRouting`;
`prompts.ts:56-87`). Add `axisScope: "all" | "initial-post-only" | "reply-only" =
"all"` as the sixth. Default `"all"` reproduces today's output EXACTLY (guard with
a test in the `prompts-praise-routing.test.ts` style). This keeps every existing
caller - the 33-file set and both other grading surfaces - byte-identical.

### 6.2 The narrowing (AC-R5), code-composed

Because the instructor's demand is free prose (`:165-166`) that cannot be
code-stripped reliably, narrowing is an APPENDED, code-composed SCOPE directive,
fired only on the non-"all" axisScope:

- `"initial-post-only"` appends a fixed directive: this evaluation covers ONLY
  the initial post; the student's replies to classmates are evaluated separately
  and are NOT part of this rubric; do not require, expect, or deduct for replies
  to classmates under any criterion here, even if the assignment instructions
  mention them.
- `"reply-only"` appends the symmetric directive scoping evaluation to the replies.

This directly countermands the deduct rule at `:193` FOR THE REPLY DIMENSION on
the initial-post axis. Combined with the structural guarantee (section 3 - reply
prose is physically absent from the initial-post request), the model has neither
the content nor the instruction to deduct the initial post for "missing" replies.

**Honest boundary (the two guarantees differ in strength):**

- STRUCTURAL (code-held, absolute): reply prose is unrepresentable in the
  initial-post request. The model cannot score text it never received. Verifiable
  as a source-text / pure-function pin (4.3 positive oracle).
- DIRECTIVE (code-composed, model-dependent): the scope directive is present in
  the composed prompt. Whether the model OBEYS it is argued, not measured (no
  live model in this checkout). That obedience is AC-R8, an owner/OV residual.

AC-R5 instrument: a unit test on `buildSystemPrompt` output - RED if
`axisScope: "initial-post-only"` omits the scope directive, or if
`axisScope: "all"` includes it (default must stay byte-identical). This measures
the CODE-COMPOSED half; the model-obedience half is explicitly out of machine
scope.

## 7. The aggregate (AC-R6, parsing.ts READ-only)

The two-axis finalise merges the axes and derives the total by CODE, never from a
single-call model total:

- `areas = [...initialAreas, ...replyAreas]` (section 3.3).
- `deriveTotalScore("", areas)` - call with an EMPTY explicit total so
  `deriveTotalScore` (`parsing.ts:208-236`) takes its sum branch
  (`parsing.ts:216-235`) over the merged areas. This is correct BY CONSTRUCTION:
  each pass's model total (`parsed.totalScore`) saw only one axis and structurally
  cannot represent the combined grade, so trusting it would drop the other axis.
  The code-derived sum is the ONLY aggregate that includes both components -
  AC-R6's live decision resolved: for a two-axis grade the code sum OVERRIDES any
  model total.
- Then `scaleResultToPoints(areas, total, pointsPossible)` (`parsing.ts:247-273`)
  and `composeOverallComment` exactly as today, now with the disclosure (4.2)
  appended when excluding.

The SINGLE-AXIS path is UNCHANGED - it still finalises via
`deriveTotalScore(parsed.totalScore, ...)` inside `gradeSubmission` and trusts a
model total when present. AC-R6 direction of failure: RED if the single-axis
(no-reply-section, non-discussion) aggregate behaviour changes, or if a reply-axis
component is dropped from the merged areas (and therefore from the posted
`rubric_assessment`, `grades.ts:134-140`).

`grading.ts` is NOT touched (R6; 977/1000). `postCanvasGrades` is NOT touched -
each merged area posts as its own `rubric_assessment[criterionId]` because its
`area` name matches a Canvas criterion, and the single `submission[posted_grade]`
is the merged total (`grades.ts:130-140`). This was confirmed by reading the post
loop, not inferred.

## 8. Authoring surface (Wave C, RubricInputModal.tsx) - the layer the instructor reaches

THE SURFACE IS A LAYER. The parser (Wave A) reads a marker line from the rubric's
free text; an instructor reaches it through `RubricInputModal.tsx` (389 lines),
also a consumer via `RubricBuilderModal.tsx` (both in the 33-file set, section
10).

### 8.1 What Wave C builds

Lowest-friction, no new parse path: the existing free-text rubric field already
accepts any line, so the marker is authorable TODAY once Wave A ships. Wave C's
job is to make it DISCOVERABLE and persistent:

- An affordance (help text and/or an "Add reply section" button) that inserts the
  canonical marker line into the field.
- Persistence of any new control state via a `ta-` localStorage key (MEMORY:
  persist-ui-control-state).

### 8.2 Anti-drift: the UI and the parser share ONE recognizer

Define a canonical marker string constant in `rubric.ts` and have the UI insert
EXACTLY that string, with a wiring test asserting
`isReplySectionMarker(CANONICAL_REPLY_MARKER) === true` (5.1). This is a code-held
link preventing the UI from inserting a marker the parser does not recognize -
the "parser ships dead / UI ships a marker nobody reads" failure the row's RULING
A and MEMORY (assignment-must-include-the-wiring-file) both name. Wave C's write
set MUST include this wiring test.

### 8.3 What is owner/OV, not machine

The rendered control, its keyboard behaviour, and the per-axis score DISPLAY are
AC-R7 / R5 - no component renders under vitest here. Wave C's machine-checkable
part is the shared-recognizer wiring test (8.2) and the persisted key; the render
is an owner walk.

## 9. Wave and file map (for loop-plan to cut)

Dependency-ordered. Exact `sort | uniq -d` disjointness proofs are the plan's.

- **WAVE A - parser axis-tag + types (foundation).**
  Write set: `src/lib/grade/rubric.ts` (marker + `isReplySectionMarker` +
  `CANONICAL_REPLY_MARKER` + axis tagging in both passes), `src/lib/grade/types.ts`
  (`RubricCriterion.axis?` AND `StudentSubmissionEntry.discussionAxes?` - both
  type additions here so `types.ts` is touched in ONE wave only;
  `discussionAxes` is a type-only forward declaration this wave, populated in
  Wave B, mirroring the accepted shape-only precedent of
  `initialPostCount`/`replyCount`), `src/lib/grade/rubric.test.ts` (owned;
  AC-R1, AC-R2). Delivers AC-R1, AC-R2.
  Gate (PowerShell): `npx tsc --noEmit`; `npm run lint`;
  `npm run test:paths -- src/lib/grade/rubric.test.ts <any source-text reader of
  rubric.ts/types.ts in the write set>` (one path per arg, never a raw multi-path
  vitest); full `npm test` (33-file blast); `npm run build`;
  `npx vitest run src/file-size-ceiling.structure.test.ts` unconditionally
  (re-measure rubric.ts/types.ts); `git status --short` vs the assignment, plus
  the `.claude/worktrees` shadow check.

- **WAVE B - per-axis scoring + exclusion + narrowing + aggregate.** Depends on
  Wave A (reads `RubricCriterion.axis` and the `discussionAxes` type).
  Write set: `src/lib/grade/extraction.ts` (populate `discussionAxes` in
  `buildDiscussionEntry`), `src/lib/grade/engine.ts` (`scoreAxis` primitive,
  per-entry dispatch, merged finalise, disclosure wiring), `src/lib/grade/prompts.ts`
  (`axisScope` param + the two scope directives + `composeReplyExclusionDisclosure`),
  their owned tests (`extraction.test.ts`, the engine's test file, the prompts
  test), the pure disclosure/gate oracle file (4.3), AND the single-axis
  non-regression oracles AC-R2b/AC-R2c (3.5, in the engine's test file).
  `parsing.ts` and `grades.ts` are READ, not edited. Delivers AC-R3, AC-R4, AC-R5,
  AC-R6, plus the AC-R2b/AC-R2c non-regression guards.
  Gate: as Wave A, `test:paths` mandatory (several owned + source-text-reader
  files), file-size canary unconditional.

- **WAVE C - authoring surface.** Depends on Wave A (the canonical marker the
  parser reads). Write set: `src/app/components/grading-recording/RubricInputModal.tsx`
  (and/or `RubricBuilderModal.tsx`), the shared-recognizer wiring test (8.2),
  persistence (`ta-` key). Delivers AC-R1's UI wiring and AC-R7's source-checkable
  half; the render is owner (R5/AC-R7).

Sequencing: A before B and C (both read the axis/type). B and C are path-disjoint
and MAY run concurrently only if the plan proves it with `sort | uniq -d` AND
neither establishes a fact the other designs against (B owns engine/extraction/
prompts; C owns the modal + shares only the Wave-A recognizer, read-only). Each
wave is its own push.

## 10. owns / blast-radius (commands stated, output pasted)

```
grep -rln "extractRubricCriteria\|RubricCriterion" src        (33 files, 2026-10-05)
```
EDITED (production, this round): `src/lib/grade/rubric.ts`,
`src/lib/grade/types.ts`, `src/lib/grade/engine.ts`, `src/lib/grade/prompts.ts`,
and (Wave C) one of
`src/app/components/content-tab/RubricBuilderModal.tsx` /
`src/app/components/grading-recording/RubricInputModal.tsx`.
CHECKED-SAFE (optional `axis` keeps them compiling; must stay green under
`npm test`): `src/app/actions/canvas-files-bulk.ts`,
`src/app/actions/snapshot-grade.ts`, `src/app/actions/snapshot-parse-rubric.ts`,
`src/app/components/grading-recording/grading-feedback-prompt.ts`,
`src/app/components/snapshot-grading/snapshot-grade-prompt.ts`,
`src/lib/canvas-modules/{raw-types,rubrics,types}.ts`,
`src/lib/canvas/metadata.ts`,
`src/lib/cartridge-import{,-shared,-blackboard-rubrics}.ts`,
`src/lib/grade.ts`, `src/lib/grade/{reconcile,run-header}.ts`,
`src/lib/rubric-{render,bulk-plan}.ts`,
`src/lib/workflows/registry/steps.rubrics.ts`, and the `*.test.ts` files among the
33 (`grading-chat-intake`, `snapshot-grade`, `snapshot-parse-rubric`,
`snapshot-grading.structure`, `reconcile`, `rubric`, `run-header`,
`rubric-bulk-plan`, `rubric-render`, `engine.ungraded`).

```
grep -rln "readFileSync" src | xargs grep -l "grade/rubric\|grade/engine\|grade/prompts\|grade/types\|grade/extraction"   (21 files, 2026-10-05)
```
Source-text readers - each reads an edited file AS TEXT, so a correct change can
turn one red; the plan intersects each against the per-wave write set with
`sort | uniq -d` and pastes the result:
`src/app/actions/action-guard-coverage-github-cohort.test.ts`,
`src/app/actions/grading.guard.test.ts`,
`src/app/api/grade-run-item/route.test.ts`,
`src/app/components/grading-recording/classTrendsRunCohort.test.ts`,
`src/app/components/grading-recording/copy-feedback.test.ts`,
`src/app/components/grading-recording/grading-rows.test.ts`,
`src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`,
`src/app/components/grading-results/ungradedDisclosure.test.ts`,
`src/app/components/grading/useIncrementalGradingRun.lifecycle.test.ts`,
`src/app/components/repo-grades/classTrendsFolderEntry.test.ts`,
`src/app/components/repo-grades/repoGradesCodeExecution.wiring.test.ts`,
`src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts`,
`src/app/components/snapshot-grading/snapshot-grading.structure.test.ts`,
`src/lib/cartridge-drops.origin.test.ts`,
`src/lib/grade/grouping-zip-parents.wiring.test.ts`,
`src/lib/grade/rubric-provenance-producers.structure.test.ts`,
`src/lib/grade/rubric-tiers.test.ts`,
`src/lib/module-graph/runtime-import-graph.ts`,
`src/lib/module-graph/runtime-import-graph.test.ts`,
`src/tools/strip-comments-agreement.structure.test.ts`,
`src/tools/vitest-paths/gate-commands.structure.test.ts`.

```
grep -rln "INITIAL POST ===\|REPLIES TO CLASSMATES" src        (1 file, 2026-10-05)
grep -rn  "discussionAxes\|initialPostContent\|replyContent" src  (0 hits, 2026-10-05)
grep -rln "RubricCriterion" src --include=*.structure.test.ts     (0 hits, 2026-10-05)
```
The markers are internal to `extraction.ts` (section 1.6); the new field names are
free; no key-count canary enumerates `RubricCriterion`.

## 11. Disposition (prior requirements -> this design)

This is a NEW artifact (`a8-scoring-architecture.md`) consuming `docs/a8-scope.md`
(AC-R1..AC-R8, R1..R-* residuals) and `docs/a8-architecture.md` section 9 / R3 /
R4. Each prior requirement is mapped so nothing is dropped. Ids re-derived last.

| Prior requirement | Disposition | Where |
|---|---|---|
| a8-scope AC-R1 (parser recognizes reply section) | KEPT -> designed | section 5 (Wave A) |
| a8-scope AC-R2 (no-marker non-regression) | KEPT -> designed, axis left ABSENT | section 5.2 |
| a8-scope AC-R3 (reply criteria score replies) | KEPT -> designed | sections 3, 6 (Wave B) |
| a8-scope AC-R4 (exclude + code-disclose) | KEPT -> designed with gate+oracle | sections 3.3, 4 |
| a8-scope AC-R5 (narrow instructions, same change) | KEPT -> designed (axisScope) | section 6.2 (Wave B) |
| a8-scope AC-R6 (aggregate carried) | KEPT -> RESOLVED (code sum overrides) | section 7 |
| a8-scope AC-R7 (authoring renders/persists) | KEPT -> owner residual | section 8.3 / R5 |
| a8-scope AC-R8 (model honours two axes) | KEPT -> owner residual | section 12 / RO-1 |
| a8-architecture section 9 (marker convention) | KEPT -> hardened (isReplySectionMarker, no-parenthetical rule) | section 5.1 |
| a8-architecture R3 (rubric authoring+parser+grader) | KEPT -> now built across Waves A/B/C | sections 5,6,8 |
| a8-architecture R4 (model-total vs code-sum) | KEPT -> RESOLVED here (was MOOT) | section 7 |
| a8-architecture:131 (reject structured entry field) | REVERSED, with justification + cost | section 2 |
| a8-scope R1/R2 (Route C/D) | KEPT -> owner residuals, untouched | section 12 |
| a8-scope R6 (grading.ts budget) | KEPT -> not touched this round | section 7, R6 |
| a8-scope R-AXIS-BLAST (33-file consumer set) | KEPT -> measured, handed to plan | sections 5.3, 10 |
| a8-scope R-FORK-A-CONFIRM | KEPT -> owner confirmation alongside Wave C | section 12 / RO-2 |
| a8-scope RT-5 (counts shape-only) | DISCHARGED | `discussionAxes.replyCount` is the reader (section 4.2) |

## 12. Residual register (owner, instrument, step)

A residual not in `docs/BACKLOG.md` does not exist; the push landing any wave must
reconcile these into the A8 row.

- **RS-1 - absent-reply scoring policy (reply section, zero replies).** Owner:
  loop-ac / test-author at build time. Instrument: a unit test on the
  code-composed absent-reply areas (section 3.4). Step: Wave B. Recommended
  reading is stated (code-composed absence, no model call); flagged in case the
  owner wants a different policy.
- **R-AXIS-BLAST - the 33-file consumer set + 21 source-text readers.** Owner:
  the loop-plan seat. Instrument: the two greps in section 10, intersected per
  wave with `sort | uniq -d` (pasted). Step: before each wave's dispatch.
- **R5 / AC-R7 - authoring control + per-axis score DISPLAY render.** Owner:
  verify/UX pass. Instrument: a running-app walk/screenshot (no component renders
  under vitest). Step: after Wave C, before it ships.
- **R6 - grading.ts budget (977/1000, no ALLOWED_OVERAGE,
  `file-size-ceiling.structure.test.ts:41`).** Owner: the plan seat of any future
  wave that edits grading.ts. Instrument:
  `@(Get-Content src/app/actions/grading.ts).Count` vs LIMIT. Step: before such a
  wave. NOT edited this round.
- **R1 / R2 - Route C (`gradeOneSubmissionAction`) and Route D (`_post.txt` /
  external API).** Owner: repo owner. Instrument: one live call each (no live
  Canvas / no external service here). Step: future, owner. Untouched this round.
- **RO-1 (AC-R8) - the model's OUTPUT honours the two-axis structure / the scope
  directive.** Owner: repo owner. Instrument: one live `gradeCanvasUrl` run of a
  real graded discussion with a reply-section rubric. Step: owner walk. The
  machine ACs prove the model RECEIVES the structure; obedience is argued, not
  measured.
- **RO-2 (R-FORK-A-CONFIRM) - re-affirm "one rubric with a reply section"
  before Wave C.** Owner: repo owner. Instrument: confirm the 2026-09-15 decision
  still holds; `docs/a8-scope.md` section 2 states the switch cost if it changed.
  Step: alongside Wave C, not a gate on this design.
- **RS-2 - two-call reliability.** Owner: reliability pass / test-author.
  Instrument: a unit test that a thrown reply-axis pass fails the WHOLE student as
  a grading-failed row (today's per-student all-or-nothing semantics, the engine's
  existing catch at `engine.ts:287-309`), not a half grade. Step: Wave B.

## 13. What could not be determined here (environment limits, `docs/loop/this-repo.md` section 6)

- **No live Gemini / no API key:** whether the model OBEYS the scope directive and
  honours the two-axis structure is argued, not measured (RO-1 / AC-R8). The
  STRUCTURAL guarantee (reply prose absent from the initial-post request) IS
  machine-verifiable (4.3); the DIRECTIVE guarantee's obedience is not.
- **No component renders under vitest:** the authoring control and per-axis score
  display are owner/OV (R5, AC-R7). No requirement in this design is enforced only
  by a render; the UI-to-parser link is a source-text wiring test (8.2).
- **No live Canvas:** Route C/D remain owner residuals (R1/R2). The post path is
  verified by reading `postCanvasGrades` (`grades.ts:128-143`), not by a live
  post.
- **grading.ts:806-813** (the brief's cite for the `assignmentInstructions`
  origin) was NOT re-opened - this round does not edit `grading.ts`; the splice
  point the design binds to (`prompts.ts:165-166`) is opened.
