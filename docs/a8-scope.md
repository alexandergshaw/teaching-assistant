# A8 scope + acceptance criteria (round 1)

Scope and AC only. No production code, no test code, touched in producing
this document. Sources: `docs/backlog.yml` id `A8` (lines 307-318, read in
full 2026-09-29) and a direct read of the current tree, commands cited inline.
A fresh `loop-checker` gates this before any consumer acts on it.

## 0. What this document covers, and what it does not

The A8 row (`docs/backlog.yml:307-318`, `state: 'unscoped'`, `owns: []`,
`verify: null`) carries an extremely long note recording several prior
scoping rounds, rulings, and one already-shipped sub-chunk. Before scoping
anything I confirmed from the tree, not from the note, which parts are
already built:

- `src/lib/grade/submission-kind.ts` exists and exports
  `GradingSubmissionKind = "initial-post" | "reply" | "other" | "unknown"`
  (`submission-kind.ts:29-31`).
- `src/app/components/grading-recording/` contains the screen-capture
  recognition/labelling code the note describes (confirmed via
  `grep -rn "SubmissionKind\|submissionKind" src`, 52 files hit, including
  `GradingTableRow.tsx`, `grading-submission-merge.ts`,
  `grading-extraction-prompt.ts`).
- The five commits the note cites as having shipped this
  (`58a4254`, `d5a3e2c`, `db747cc`, `75bd7d4`, `ad3dd61`) all exist in this
  repo's history (`git cat-file -t <sha>`, each returned `commit`).

I did not re-audit those commits' diffs line by line; I only confirmed (a)
the commits exist and (b) the files/exports the note says they produced are
present in the current tree. That satisfies "brief from the tree" for the
purpose of scoping what is *left*, not a re-verification of already-shipped
work.

**What is left**, per the note's own chunking (it called the remainder
"A8-P": "the LMS-connected AI paths, routes a+g, 10 files"), and per my own
trace below, is the **Canvas-API-connected AI grading paths** - the routes
where an instructor grades a discussion pulled live from Canvas (not a
screenshot). This document scopes that remainder. It supersedes no other
docs/a8*.md file: `docs/a8r-scope.md` is the already-shipped screen-capture
chunk's own scope doc and is untouched by this one (confirmed via
`ls docs/a8*.md`: only `a8r-scope.md` exists today, this file is new).

I did not touch any `src` file, any N13b file, or any A42 file. Verified:
`git status --short` at the end of this session (below, section 6) shows
only `docs/a8-scope.md` as new/changed.

## 1. Blast radius (measured)

### 1.1 The data layer already splits initial post from reply

`src/lib/canvas/discussions.ts`:
- `DiscussionPost` (`:9-16`) carries `isReply: boolean` and
  `parentUserId: number | null`.
- `DiscussionActivity` (`:19-22`) is `{ initialPosts: DiscussionPost[]; replies: DiscussionPost[] }`.
- `extractDiscussionActivity` (`:39-79`) computes `isReply` from thread depth
  (`:61`, `const isReply = depth > 0`) and pushes into the right bucket
  (`:69-70`).
- `CanvasStudentWork` (`:106-119`) carries `discussion?: DiscussionActivity`
  (`:116`) alongside a flat `text: string` (`:110`) and
  `contributionCount: number` (`:114`).
- `fetchDiscussion` (`:122-158`) builds the flat `text` by concatenating
  `[...initialPosts, ...replies]`, each line prefixed `"Post: "` or
  `"Reply: "` and joined by `\n\n---\n\n` (`:144-146`), and sets
  `contributionCount: activity.initialPosts.length + activity.replies.length`
  (`:152`). It also sets `discussion: activity` (`:153`) - the split data
  rides alongside the flattened text on every `CanvasStudentWork` a
  discussion produces.

So for a **discussion fetched via Canvas's `/view` endpoint**, the
initial-vs-reply distinction is present in `CanvasStudentWork.discussion` the
moment the object is built. This confirms the row's "the data layer already
knows" claim (`docs/backlog.yml:317`) still holds in the current tree.

### 1.2 Where the distinction is dropped, per route

I traced every caller of `canvasWorkToEntry` (`src/lib/grade/extraction.ts:238`,
the function that turns one `CanvasStudentWork` into a gradable
`StudentSubmissionEntry`) and every place a discussion reaches the model,
rather than trusting the note's route list, because the note itself records
two prior passes that mis-identified surfaces by grepping type names instead
of reading call graphs.

**Route A - `gradeCanvasUrl` (the default/Gemini AI path).**
`src/app/actions/grading.ts:816-825` calls `gradeCanvasUrl` for any Canvas
URL when the provider is neither `"other"` nor `"embedded"`. `gradeCanvasUrl`
(`src/lib/grade/engine.ts:446-478`) calls `fetchCanvasWork` (`:454`), which
for a discussion URL calls `fetchDiscussion`
(`src/lib/canvas/work.ts:27-29`) - so `students[].discussion` **is**
populated here. It then loops `for (const work of students) entries.push(await canvasWorkToEntry(work))`
(`engine.ts:471-472`). `canvasWorkToEntry` (`extraction.ts:238-253`) reads
only `work.text` (`:245-247`) to build the model-facing content and never
reads `work.discussion` (confirmed: `grep -n "\.discussion\b" src/lib/grade/extraction.ts`
returns no hits). **Data is present; this function drops it.** This is the
single wiring point for Route A: fixing `canvasWorkToEntry` is necessary and
(per this trace) sufficient for Route A, because it is the only place
between `fetchCanvasWork` and the model that ever sees the `work` object.

**Route B - `extractCanvasEntries` (embedded engine, non-discussion
fallback).** Same function, called from `src/lib/grade/extraction.ts:176-188`,
same `canvasWorkToEntry` loop (`:185`). However, under the current control
flow this path **never actually receives a discussion `work` object**:
`src/app/actions/grading.ts:770-793` routes any Canvas URL whose kind is
`"discussion"` (via `detectCanvasUrlKind`, `:773`) to
`buildDiscussionRubric`/`gradeDiscussion` (the deterministic embedded
discussion grader, see 1.3) and returns *before* reaching
`extractCanvasEntries` at `:796`. So Route B is a dead branch for discussions
today - a real fact worth stating so no one scopes work here expecting it to
matter.

**Route C - `gradeOneSubmissionAction`.**
`src/app/actions/grading.ts:601-652`. This is a materially different and
harder case: it never calls `fetchCanvasWork`/`fetchDiscussion` at all. It
calls `fetchSubmissionDetail` (`src/lib/canvas/submission-detail.ts:94`),
which hits Canvas's generic
`.../assignments/{assignmentId}/submissions/{userId}` endpoint and builds
`text` from `submission.body` (`submission-detail.ts:120`,
`const text = submission.body ? htmlToText(submission.body) : "";`) - there
is no call to the discussion `/view` endpoint, so there is **no
`DiscussionActivity` to have**. The `CanvasStudentWork` built at
`grading.ts:615-622` never sets a `discussion` field at all. **The
initial-vs-reply distinction is not reachable on this route without a new
Canvas API call** (fetching that student's discussion view), which is a
materially different, larger change than "read a field that is already
there." I did not scope that call here - see Residual R1.

**Route D - the external "other" (Deterministic Grading API) engine.**
`src/app/actions/grading.ts:752-766` (Canvas-URL case) and `:852-854`
(zip-upload case) both route through `gradeZipViaEngine`. For the Canvas-URL
case, `students` again comes from `fetchCanvasWork` (`:753-754`), so
`work.discussion` **is** populated for a discussion URL. But
`canvasWorkToZipBase64` (`src/lib/canvas/submissions.ts:166-188`) only ever
packs `work.text` into a file literally named `` `${prefix}_${seq}_post.txt` ``
(`:182-183`) and never touches `work.discussion`. Nothing in this repo reads
that file back (`grep -rn "_post" src`, excluding tests, finds only the
writer and unrelated `delayed_post_at`/`initial_post` hits) - it is consumed
only by the external Deterministic Grading API. So Route D has the *same*
data-availability profile as Route A (present, dropped at the packing step),
but its correctness after any change is **unverifiable from this repo**: we
cannot know whether that external service would even understand a
differently-shaped zip entry. See Residual R2.

**The discussion-aware deterministic engine (not a gap).**
`src/app/actions/grading.ts:770-793`, for `provider === "embedded"` and a
discussion URL, builds `discussionStudents` directly from
`s.discussion` (`:778-780`, `.filter((s) => s.discussion)`) and calls
`buildDiscussionRubric`/`gradeDiscussion`
(`src/lib/embedded-grader/discussion.ts`), which already computes
`initialCount`, `replyCount`, and `peerReplyCount` as separate numbers
(`discussion.ts:79-114`) and already has a distinct "no initial post" label
(`:138`, `:150`). **This route is not part of A8's remaining blast radius** -
it already respects the split. It is a separate rubric mechanism (regex/text
"signals" detected from free text, not the criterion-parsing the AI path
uses - see 2.1) and nothing here proposes reusing or changing it.

### 1.3 `contributionCount`: still write-only

`grep -rn "contributionCount" src` (run 2026-09-29) returns 9 hits: the
field declaration (`discussions.ts:114`), three writers
(`discussions.ts:152`, `submissions.ts:158` always `1`,
`grading.ts:620` a files/text-derived count for Route C), and five test
fixtures in `src/lib/grade/extraction.test.ts`. (CORRECTED by the round-1
check: an earlier draft said "8"; the enumeration above sums to 9 and
`grep -rn "contributionCount" src | wc -l` = 9. There was no drop from the
note's "NINE" - still 9.) None of the 9 is a read used in scoring or routing
logic. Splitting this field into
two counts (implication 3) is therefore a change with **no currently
measurable downstream effect** other than the field itself - low risk,
fork-independent, and its own AC below is correspondingly modest.


### 1.3a Round-1 check reconciliations (INFO-2, INFO-3)

- INFO-2 (stale ruling): an EARLY orchestrator ruling still in the A8 row -
  "A8-1's wiring file is `src/lib/canvas/discussions.ts`, NOT
  `src/lib/grade/extraction.ts`" - is SUPERSEDED by the row's later G1
  guarantee design (read `work.discussion` inside `canvasWorkToEntry`). This
  scope follows G1, so the choke point is `extraction.ts:238-255`, NOT
  `discussions.ts`. An implementer reading the stale ruling (d) must ignore it
  in favour of G1 / this scope.
- INFO-3 (truncation survival, routes to the architect): AC-2's object is "the
  actual API request Gemini receives," but the reply text is appended after the
  initial post and can be truncated away at a small
  `getGeminiMaxCharsPerSubmission` cap - so a PRE-truncation assertion can pass
  while the model never sees the reply. The architect/test-author must ensure
  the reply distinction SURVIVES truncation (or test AC-2 post-truncation with a
  realistic cap). Also confirm `disambiguateCanvasEntries` (`engine.ts:480`)
  does not re-flatten per-entry `submittedFiles` after the loop.

### 1.4 The Canvas grade-post path already carries more than one number

`src/lib/canvas/grades.ts`, `postCanvasGrades` (`:55` on). Per student
(`:128-151`):
- `submission[posted_grade]` is set once, from a single `grade` string
  (`:130`).
- For **each** entry in `rubricAreas` whose `area` name matches (via
  `normalizeCriterionName`) a criterion on the Canvas assignment's *own*
  attached rubric, a **separate** `rubric_assessment[<criterionId>][points]`
  (and `[comments]`) pair is appended (`:133-143`).

So the wire format Canvas accepts is not "one number" - it is one aggregate
plus N named per-criterion scores, and the app already produces N named
scores: `GradeResultBase.rubricAreas: RubricAreaResult[]`
(`src/lib/grade/types.ts:237`, `RubricAreaResult = { area: string; score: string; comment: string }`,
`:39-43`) sits alongside the single `totalScore: string` (`types.ts:238`).
`deriveTotalScore` (`src/lib/grade/parsing.ts:175-203`) only *computes* the
aggregate from the sum of `rubricAreas` when the model did not supply an
explicit total (`:179-181`); when the model does supply one (the normal case
on the Gemini path), that model-supplied string is used as-is and the
per-area sum is not enforced against it.

This directly grounds Fork B - see 2.2.

### 1.5 The AI-path rubric has no concept of a "section"

`extractRubricCriteria` (`src/lib/grade/rubric.ts:27-30`, delegating to
`extractRubricCriteriaStrict`/`extractRubricCriteriaWidened`) parses rubric
text into a **flat list** of `{ name, points }` criteria, one per
non-indented line (`rubric.ts:36-40`). There is no boundary marker, no
grouping, nothing that would let a criterion be tagged "this one applies to
replies." Implementing Fork A's owner-decided shape ("one rubric with a
reply section") requires a **new parsing convention** on top of this parser.
That convention is a design decision (what marks the boundary, how it
survives the strict/widened fallback in `extractRubricCriteria`) that this
scoping pass does not make - it belongs to an architecture pass, not to AC.
Stated as a residual (R3), not silently deferred.

### 1.6 A UI surface for per-contribution labelling already exists and is reusable

`canvasWorkToEntry` currently pushes exactly **one** `SubmittedFileInfo` per
discussion, named `"Discussion post"` or `"Submission text"`
(`extraction.ts:247-253`). The results table already renders
`StudentSubmissionEntry`/`GradeResult.submittedFiles` as a **list**, one
`<li>` per file, keyed and labelled by `file.name`
(`src/app/components/grading-results/FilesCell.tsx:41-47`; a sibling,
`SubmittedFilesPanel.tsx`, does the same for the expanded view). If
`canvasWorkToEntry` instead pushed one `SubmittedFileInfo` per initial post
and one per reply (each carrying a distinguishing `name`, e.g. `"Initial post"`
/ `"Reply"`), the **existing** list UI would render them as separate,
labelled items with no new UI component required. This is a reading claim,
not a rendered one - see the OV note in section 4.

One concrete gap this surfaces: labelling a reply usefully (e.g. "Reply to
Seth Vander Vorst") needs the replied-to student's *name*, but
`DiscussionPost.parentUserId` (`discussions.ts:15-16`) is a bare
`number | null`. The display-name map is computed in
`extractDiscussionActivity` (`names: Map<number, string>`, `:47-79`) but is
only used to name the *acting* student (`fetchDiscussion:140`,
`names.get(userId)`) - it is never threaded down to resolve a
`parentUserId`. Recorded as Residual R7, since it is buildable but not
scoped in the AC below (the AC below requires only that a reply be
labelled as a reply, not that it name who it replied to).

### 1.7 Line budget on the one file most likely to change

`src/app/actions/grading.ts` is **977 lines** today
(`@(Get-Content src/app/actions/grading.ts).Count`, PowerShell, run
2026-09-29), against `LIMIT = 1000` in
`src/file-size-ceiling.structure.test.ts:41`, with **no**
`ALLOWED_OVERAGE` entry for this path
(`grep -n "grading.ts" src/file-size-ceiling.structure.test.ts` returns
nothing). That is 23 lines of headroom. The note recorded 905/1000 on
2026-09-20; it has grown 72 lines since (most likely the A8-R and other
work that landed since). Any wave that adds a discussion-recognition branch
to `gradeOneSubmissionAction` or extends the Canvas-URL branching in
`gradeAction` **must** re-measure this before writing code and extract
first if the addition would exceed 1000. Carried as Residual R6 rather than
guessed at, because 23 lines is not enough margin to state confidently now
that any specific future change fits.

## 2. The two product forks

### 2.1 Fork A (rubric's second axis) - ALREADY DECIDED, NOT YET BUILT

The task briefing for this scope treats this as open and asks for a
recommendation. Reading the row directly shows it is **not open**: `docs/backlog.yml:317`
contains "SECOND OWNER DECISION 2026-09-15, closing implication (1)... ONE
RUBRIC WITH A REPLY SECTION... Not two instructor-supplied rubrics, and not
an app-side split of a single rubric by convention." That is an owner
decision already on record, not a fork awaiting a recommendation. I am not
re-opening it, and I am not asking the owner to re-answer a question they
already answered.

What **is** still true, per 1.5, is that this decision has not been built:
no rubric-parsing code recognizes a "reply section" anywhere in the tree.
Building it is out of this scope's fork-independent AC (section 3) because
`RULING A` in the same row note - "EXCLUSION IS DEFERRED; RECOGNITION SHIPS
FIRST... exclusion waits until a rubric can actually carry a reply section"
- makes the reply-section-authoring surface a prerequisite for anything that
*uses* it, and that surface does not exist. Building the authoring surface
and its parsing convention is the natural next scoping activity after this
one lands; it is recorded as Residual R3, not silently dropped.

### 2.2 Fork B (is the score still one number) - RECOMMENDED READING, grounded in the traced post path

**The fork as stated:** can the grade path carry two component scores, or
must they be combined before posting to Canvas, and if combined, by what
rule and does the instructor set it?

**Recommended reading:** use the existing multi-component carrier as-is; do
not build a new combination mechanism now.

Grounds, from 1.4: `rubricAreas: RubricAreaResult[]` already carries any
number of named, independently-scored components, and `postCanvasGrades`
already posts each one to Canvas as its own `rubric_assessment[...]` entry
when its name matches a Canvas criterion. A reply-section score, once Fork
A's authoring surface exists, is simply one more `RubricAreaResult` with an
`area` name matching the Canvas rubric's reply criterion - no new plumbing
between the grader and Canvas is needed for the *per-criterion* half. The
*aggregate* half (`posted_grade`/`totalScore`) already has a code-computed
fallback (`deriveTotalScore`, sums `rubricAreas` when the model does not
supply its own total) but does not currently *enforce* that sum against a
model-supplied total - whether that should change is a real question, but
it is not blocking, because of the next paragraph.

**Why this does not block anything in this round:** the owner's separate,
already-recorded decision for the no-reply-section case (`docs/backlog.yml:317`,
"REPLY SCORING when the rubric has no reply section: EXCLUDE the replies
... and DISCLOSE the gap") produces **zero** new score components - replies
are excluded from scoring entirely, not scored on a second axis, in that
state. Since the reply-section-authoring surface does not exist yet (2.1),
every rubric is in the "no reply section" state today, so Fork B's
"two components" case cannot currently occur. Fork B only becomes live once
Fork A's authoring surface ships. I am recommending the existing-carrier
reading now (a cheap, load-bearing recommendation that this round's AC does
not depend on), and filing the real decision - whether to enforce
code-derived totals once a reply criterion exists - as Residual R4, owned by
whoever scopes the authoring surface.

**Cost of being wrong:** if the owner instead wants an app-authored
combination *rule* (e.g., a fixed weighting between the initial-post and
reply components) rather than letting `rubricAreas` + `deriveTotalScore`
handle it, that changes the shape of the authoring-surface work in 2.1's
follow-on scope, not anything in this round's AC - none of AC-1 through
AC-6 below reads or writes `rubricAreas`.

## 3. Fork-independent acceptance criteria

Each AC names the object under comparison, the instrument that produces
each quantity, and the direction of failure. "NEW" instruments (nothing in
the repo measures this today) are marked; where a test file is implied it
does not exist yet - these are AC, not test notes, and a future test-author
seat still owns choosing exact fixtures/oracles.

**AC-1 (Route A recognition, not blocked).** Object: the request body
`canvasWorkToEntry` builds from a `CanvasStudentWork` whose `discussion` is
set. Instrument (NEW): a unit test on `canvasWorkToEntry` with a
`DiscussionActivity` fixture containing at least one initial post and one
reply, asserting the built content distinguishes them (e.g. two separate
`SubmittedFileInfo` entries, or an equivalent code-held marker - the exact
representation is an implementation choice, not fixed here). Direction of
failure: red if the initial post and any reply are indistinguishable in the
entry `canvasWorkToEntry` returns for a `work.discussion` that has both.

**AC-2 (Route A reaches the model unmerged).** Object: the actual API
request Gemini receives when `gradeCanvasUrl` grades a discussion (i.e. the
built `StudentSubmissionEntry.content`/`submittedFiles`, since that is what
downstream prompt-building serializes). Instrument (NEW): a test at the
`canvasWorkToEntry`/`gradeCanvasUrl` boundary asserting the reply text is
present and distinguishably labelled, not folded into the same unlabelled
blob as the initial post. Direction of failure: red if the built entry for
a discussion with replies is byte-identical in shape to the pre-fix
`work.text`-only entry (a regression to the current behavior this AC exists
to fix).

**AC-3 (`contributionCount` split, not blocked, low blast radius per 1.3).**
Object: `CanvasStudentWork.contributionCount`. Instrument (NEW): a unit
test on `fetchDiscussion`/`extractDiscussionActivity` (or wherever the
split lands) asserting two distinct counts are available - initial-post
count and reply count - for a fixture with, e.g., 1 initial post and 2
replies. Direction of failure: red if only one combined number remains
reachable, or if either count silently equals the other for an activity
where they differ. Note: per 1.3, no existing caller reads
`contributionCount` today, so this AC's pass condition is about the field's
shape, not about any currently-observable behavior change.

**AC-4 (two distinct "nothing here" states, not blocked).** Object: a
student's `DiscussionActivity` where exactly one of `initialPosts`/
`replies` is empty. Instrument (NEW): a unit test asserting that "wrote
replies but no initial post" and "wrote an initial post but no replies"
produce distinguishable results (distinct messages, flags, or codes - not
fixed here) from whichever component consumes the split (the AI-path
recognition built in AC-1, at minimum). Direction of failure: red if both
states collapse to the same signal (e.g. both read only as "low
contribution count") anywhere in the code this AC's instrument exercises.
Explicitly out of AC-4's scope: the *embedded* discussion engine
(`src/lib/embedded-grader/discussion.ts`) already partially does this
(1.2) and is not touched by this AC.

**AC-5 (UI marks which contribution is which, not blocked, reading-grounded per 1.6).**
Object: the list of `submittedFiles` a discussion entry produces for the
Canvas-API-connected results table (`FilesCell.tsx`/
`SubmittedFilesPanel.tsx`). Instrument: OV (observation via reading source -
no component renders under vitest in this repo; this is a reading claim
about what the existing list-rendering code does with distinctly-named
entries, not a rendered screenshot). Pass condition: each `SubmittedFileInfo.name`
this route produces for a discussion is either `"Initial post"`,
`"Reply"`/a reply-specific label, or otherwise textually distinguishes an
initial post from a reply - never both under the same generic name (today:
always `"Discussion post"`, per 1.6). Direction of failure: an implementer
report or checker read of the built `submittedFiles` array showing two
entries (one initial post, one reply) with the same or an ambiguous `name`.

**AC-6 (Route D data made available for future use, not blocked, scoped narrowly).**
Object: `canvasWorkToZipBase64`'s inputs. Instrument: none required by this
AC beyond what AC-1 already produces, because `work.discussion` becomes
available to any caller the moment AC-1's fix lands upstream in the shared
`CanvasStudentWork` shape - AC-6 exists only to state explicitly that
**no change to `canvasWorkToZipBase64` itself is in scope this round**
(Residual R2 covers why). Direction of failure: n/a - this AC is a
scope boundary statement, not a testable behavior.

**AC-7 (BLOCKED on Fork A - not scoped this round).** Any AC that would
require the app to *score* a reply against criteria (as opposed to
recognizing/labelling it, or excluding it and disclosing the exclusion) is
blocked on the reply-section-authoring surface (2.1, Residual R3) and is
explicitly **not** part of this round's AC.

**AC-8 (BLOCKED on Route C's missing data - not scoped this round).** Any
AC for `gradeOneSubmissionAction` recognizing a discussion's replies is
blocked on giving that route a discussion `/view` call it does not have
today (1.2, Residual R1) and is explicitly **not** part of this round's AC.
The narrower, currently-buildable fact - that Route C's `CanvasStudentWork`
never sets `discussion` and its text has no Post/Reply structure at all
(submission-detail.ts:120) - is recorded in 1.2 so a future scope does not
have to re-derive it.

## 4. What could not be determined here (environment limits, `docs/loop/this-repo.md` section 6)

- No live Canvas call, so none of the above was exercised against a real
  discussion topic; every claim about what data Canvas returns is grounded
  in reading the existing fetch code and its own type shapes, not a live
  response.
- No component renders under vitest in this repo (`docs/loop/this-repo.md`;
  also `AGENTS.md`'s dev-loop pointer). AC-5's UI claim is explicitly OV
  (observation via reading), not a rendered or interactive check.
- No live external Deterministic Grading API call, so Route D's actual
  tolerance for a changed zip-entry shape is unknown and not guessed at
  (Residual R2).

## 5. Disposition of prior artifact content

No prior `docs/a8-scope.md` existed (`ls docs/a8*.md` before this write:
only `a8r-scope.md`), so there is no prior version of *this* document to map
requirement-by-requirement. What this document does instead, to avoid
silently dropping the row's own prior findings: every residual the row's
own rulings had already established for the remaining work (routes C and D)
is carried forward unchanged in section 6, with the same owner/instrument/
step shape the row used, rather than re-litigated or dropped.

## 6. Residual register

Each entry: owner, instrument, step.

**R1 - Route C (`gradeOneSubmissionAction`) discussion recognition is
unverifiable without a live Canvas call.** Carried forward from the row's
own RULING J. Owner: repo owner. Instrument: one live single-submission
grade against a real graded discussion through `gradeOneSubmissionAction`.
Step: after any code change giving this route a discussion `/view` call is
built and mock-tested (not scoped this round - see AC-8).

**R2 - Route D (`_post.txt` / the external Deterministic Grading API) is
unverifiable without a live call to that external service.** Carried
forward from the row's own RULING J, re-measured: `grep -rn "_post" src`
(excluding tests) still shows no in-repo reader. Owner: repo owner.
Instrument: one run against the live external Deterministic Grading API.
Step: before any change to what `canvasWorkToZipBase64` writes for a
discussion (not scoped this round - see AC-6).

**R3 - Fork A's authoring surface and parsing convention are not designed
here.** Owner: an architecture pass (next activity on A8, per this repo's
two-rounds-then-ask cadence - this is a new activity, not a third round of
this one). Instrument: a design artifact fixing how a rubric marks a reply
section text and how `extractRubricCriteria` (`rubric.ts:27`) recognizes
the boundary without changing behavior for any rubric that parses today
(the same non-regression bar `rubric.ts`'s own header comment already
states for its strict/widened split). Step: before any implementer wave
touches `rubric.ts` for this feature.

**R4 - Fork B's real decision (enforce a code-derived aggregate vs. trust
the model's combined total) is moot until R3 ships, and is not decided
here.** Owner: whoever scopes the authoring surface in R3. Instrument:
re-examine `deriveTotalScore` (`parsing.ts:175-203`) and `postCanvasGrades`
(`grades.ts:128-151`) once a rubric can actually carry a reply-section
criterion, asking whether a model-supplied total that ignores the reply
component should be trusted or overridden. Step: that future scoping pass,
not this one.

**R5 - AC-5's UI claim is a reading claim, not a rendered one.** Owner: the
verify/UX pass at implementation time. Instrument: a manual check in the
running app (or a screenshot), since this repo renders no component under
vitest. Step: after AC-1/AC-5's implementer wave, before that wave ships.

**R6 - `grading.ts`'s line budget (977/1000, 23 lines of headroom,
`file-size-ceiling.structure.test.ts:41`, no `ALLOWED_OVERAGE` entry) will
likely have moved by the time any wave lands.** Owner: the wave-plan seat
for whichever wave touches `grading.ts`. Instrument:
`@(Get-Content src/app/actions/grading.ts).Count` compared against `LIMIT`
in `src/file-size-ceiling.structure.test.ts`. Step: immediately before that
wave's implementer starts; extract first if the budget does not fit.

**R7 - Labelling a reply with who it replied to needs a name lookup that
does not exist yet.** `DiscussionPost.parentUserId` (`discussions.ts:15-16`)
is a bare `number`; the `names: Map<number, string>` built in
`extractDiscussionActivity` (`:47-79`) is never threaded to resolve it.
Owner: the implementer of AC-5, if a future revision of that AC asks for a
named label rather than just a "Reply" label (AC-5 as written above does
not require the name). Instrument: a unit test on the labelling function
asserting a resolved display name, not a bare user id, appears. Step: the
wave that builds AC-5, only if the AC is later tightened to require it.

**R8 - `contributionCount`'s zero-readers state (1.3) should be
re-confirmed at implementation time, not assumed to still hold.** Owner:
the implementer of AC-3. Instrument: `grep -rn "contributionCount" src`
re-run immediately before that change, plus `tsc` after. Step: the wave
implementing AC-3.
