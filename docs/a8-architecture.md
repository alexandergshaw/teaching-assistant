# A8 remainder - architecture and design (round 1)

Design only. No production code, no test code, was written or changed to
produce this document. This is the architecture pass for the A8 remainder
scoped in `docs/a8-scope.md`: grade a student's discussion REPLIES as distinct
from their INITIAL POST on Route A (the live-Canvas Gemini AI path), so the app
stops presenting a reply as a second initial post.

Consumer: a `loop-implementer` building from a wave plan. A fresh `loop-checker`
gates this before that implementer acts. Every quantity below names the command
that produced it; every `file:line` was opened in this session.

## 0. What this pass decides, and what it must not re-open

Settled by the owner and carried unchanged from the A8 row
(`docs/backlog.yml:307-318`, read in full 2026-09-29) and the checked scope
(`docs/a8-scope.md`, read in full):

- Replies are graded SEPARATELY, against DIFFERENT criteria - not excluded, not
  merely labelled - as the eventual target (owner, 2026-09-15).
- The rubric shape is ONE RUBRIC WITH A REPLY SECTION - not two rubrics, not an
  app-side convention split (owner, 2026-09-15, second decision).
- When the rubric has no reply section: EXCLUDE the replies from the
  initial-post criteria and DISCLOSE the gap (owner, 2026-09-20 #2).
- RECOGNITION SHIPS FIRST; EXCLUSION IS DEFERRED until a rubric can carry a
  reply section AND the model-facing instructions are narrowed in the same
  change (orchestrator RULING A, in the row). Exclusion alone would make grading
  worse than the defect: the assignment instructions still demand the replies,
  so the model would deduct for work it can no longer see
  (`src/lib/grade/prompts.ts:87-89` semantics, cited in the row).

Therefore THIS round is RECOGNITION on Route A only. The model must receive the
replies LABELLED as replies, distinct from the initial post, so it can never
present a reply as an original post. Scoring separation, exclusion, and the
reply-section rubric are DESIGNED here (section 9) but NOT BUILT this round;
building them now would ship dead code (section 9 proves it) and is filed as
residuals. This matches `docs/a8-scope.md` AC-1..AC-6 (recognition) and AC-7
(scoring - BLOCKED, not this round).

Route C (`gradeOneSubmissionAction`) and Route D (external Deterministic
Grading API / `_post.txt`) stay owner-only residuals R1/R2 (section 16); this
pass does not design them and section 10 states the boundary.

## 1. The load-bearing facts, measured

These four facts decide the whole shape. Each was read directly.

### 1.1 The distinction is present and unread at the choke point

`grep -rn "\.discussion\b" src/lib/grade src/lib/canvas` returns NO hit inside
`src/lib/grade`. So nothing between `fetchDiscussion` and the model reads
`work.discussion`. The split data
(`DiscussionActivity = { initialPosts, replies }`,
`src/lib/canvas/discussions.ts:20-23`) rides on every discussion
`CanvasStudentWork` (`discussions.ts:116,153`) and is dropped by
`canvasWorkToEntry` (`src/lib/grade/extraction.ts:238-372`), which builds the
entry from `work.text` only (`extraction.ts:245-255`). This is the single
wiring point for Route A (confirmed in `docs/a8-scope.md` 1.2), and it is the
choke this pass fixes.

### 1.2 What the model actually receives, and what truncation cuts

Read `src/lib/grade/engine.ts:41-91` and `:218-249`:

- The model's request text is
  `` `${systemPrompt}\n\nStudent: ${studentName}${fileListBlock}\n\nSubmission:\n${SUBMISSION_FRAMING_HEADER}\n\n${content}${imageNote}${codeNote}` ``
  (`engine.ts:76-79`).
- `content` here is `truncatedContent` = `truncateSubmission(entry.content, maxCharsPerSubmission)` (`engine.ts:224-227`).
- `truncateSubmission` (`src/lib/grade/utils.ts:15-28`) is a BLIND PREFIX SLICE:
  it returns `content.slice(0, maxChars)` plus a trailing note. Anything past
  `maxChars` is gone. So a reply appended after a long initial post is cut with
  no trace, exactly as INFO-3 warns (`docs/a8-scope.md:184-187`).
- `fileListBlock` = `buildSubmittedFileNamesBlock(submittedFiles)`
  (`engine.ts:74`, `src/lib/grade/prompts.ts:270-283`). It is NOT truncated, but
  it FILTERS to base names that `.includes(".")` (`prompts.ts:271-274`). A
  contribution label with no dot (for example `"Initial post"`) is dropped from
  it - and that is DESIRED here (section 3.4): we must not make the model think
  there is a file named `initial-post.txt`, because that block exists to check
  filename requirements. So the recognition label must live in `content`, not in
  the file-name block.
- `getGeminiMaxCharsPerSubmission()` default is 400000
  (`src/lib/gemini.test.ts:24`, `expect(...).toBe(400000)`). It is overridable
  by `GRADE_MAX_CHARS_PER_SUBMISSION`. `engine.test.ts:8` mocks it to 20 - the
  wrong-reason trap the row names (`docs/backlog.yml:317`: "at that cap
  truncateSubmission would strip reply text REGARDLESS of the fix").

### 1.3 disambiguateCanvasEntries does not re-flatten submittedFiles

`disambiguateCanvasEntries` (`src/lib/grade/extraction.ts:221-230`, called at
`engine.ts:480`) maps each entry to `{ ...entry, student: label }` and rewrites
ONLY `entry.student`. `submittedFiles` (and `content`) pass through untouched.
INFO-3's second question is answered: per-entry `submittedFiles` survive the
post-loop pass. (Confirmed by reading `:225-229`.)

### 1.4 The grade-post path already carries N named scores

`postCanvasGrades` (`src/lib/canvas/grades.ts:128-143`) sets one
`submission[posted_grade]` from a single `grade` string (`:130`), then for EACH
`rubricAreas[]` entry whose `area` name matches a Canvas rubric criterion
(`normalizeCriterionName`, `:135`) appends a separate
`rubric_assessment[<criterionId>][points]` and `[comments]` (`:138-140`).
`deriveTotalScore` (`src/lib/grade/parsing.ts:175-203`) trusts an explicit
model total when present (`:179-181`) and only sums `rubricAreas` otherwise.
This grounds Fork B (section 8): the carrier already exists.

## 2. Reuse survey (vetted)

Each symbol opened this session. `file:line` from a direct read.

| Symbol | `file:line` | What it gives us |
|---|---|---|
| `DiscussionActivity` `{ initialPosts, replies }` | `src/lib/canvas/discussions.ts:20-23` | The already-split structure; the whole fix is reading it instead of `work.text`. |
| `DiscussionPost` `{ text, createdAt, isReply, parentUserId }` | `discussions.ts:9-17` | Per-contribution text and the id of the replied-to user (for the reply label). |
| `extractDiscussionActivity` | `discussions.ts:44-82` | Builds `byUser` activity AND a `names: Map<number,string>` (`:48-53`) - the map that resolves a `parentUserId` to a display name (discharges R7, section 3.3). |
| `fetchDiscussion` | `discussions.ts:122-158` | The Route-A source that already sets `discussion: activity` (`:153`); where the count split lands (section 5). |
| `canvasWorkToEntry` | `src/lib/grade/extraction.ts:238-372` | The choke. Signature and return shape stay identical; only its body branches on `work.discussion`. |
| `toPreviewContent` | `src/lib/grade/utils.ts:49-` | Produces `{ text, truncated }` for `SubmittedFileInfo.previewContent`/`previewTruncated`; reused per contribution (as `extraction.ts:247-252` already does for the single file today). |
| `SubmittedFileInfo` | `src/lib/grade/types.ts:119-126` | The per-file record the results table renders; one per contribution carries recognition into the entry and the UI. No new type needed. |
| `FilesCell` list renderer | `src/app/components/grading-results/FilesCell.tsx:39-92` | Renders each `submittedFiles` entry as its own labelled `<li>` keyed by `file.name`, appending the extension ONLY when it is set and not `"(none)"` (`:43-47`). Contribution files with extension `"(none)"` render as the bare label. No edit needed (section 7). |
| `SubmittedFilesPanel` | `src/app/components/grading-results/SubmittedFilesPanel.tsx` | The expanded browse-all view; same list-of-files contract. No edit needed (OV, section 7). |
| `rubricAreas: RubricAreaResult[]` + named `rubric_assessment` post path | `types.ts:39-43,237`; `grades.ts:128-143` | The multi-component score carrier - reused AS-IS once a reply criterion exists; no new plumbing this round (section 8). |

### Do NOT reuse

| Not reused | Why |
|---|---|
| `work.text` for a discussion | It is the flat `"Post: ... --- Reply: ..."` concatenation (`discussions.ts:143-146`). Building recognition by string-splitting it is exactly the "hope, not guarantee" the row forbids (`docs/backlog.yml:317`, G1). Build from `work.discussion` instead. |
| `buildSubmittedFileNamesBlock` as a label carrier | It filters to dotted filenames (`prompts.ts:273`) and exists to check filename requirements. Injecting `"Initial post"` there either vanishes (no dot) or corrupts that feature. The label carrier is `content`. |
| `SnapshotRole` / the snapshot role union | Three source headers forbid crossing that boundary (`snapshot-shot.ts:6-9` on point; the row corrects the other two cites). It is also an instructor-declared, pre-capture-armed value (row RULING B correction) - wrong shape for a code-built Canvas label. This pass invents no union; the labels are plain code-composed strings. |
| The embedded discussion grader (`src/lib/embedded-grader/discussion.ts`) | Already reply-aware and out of Route A's blast radius (`docs/a8-scope.md:143-153`). Owner ruled the provider choice stays authoritative - do NOT route Route A through it (`docs/backlog.yml:317`, decision 3). |
| A new `StudentSubmissionEntry` field for the reply section | Rejected after design (section 4.3): a second field splits `content`'s single source of truth and creates a latent-drop risk for any future entry consumer. The design keeps `content` self-contained. |

## 3. The choke-point fix (G1 guarantee): how canvasWorkToEntry builds the entry

`canvasWorkToEntry` gains a branch at the TOP: if `work.discussion` is set (the
Route-A discussion case), build `content` and `submittedFiles` from
`work.discussion`; otherwise fall through to today's unchanged `work.text`/files
path (`extraction.ts:245-372`). A discussion `work` has `files: []` and never
sets `submissionUrl` (`discussions.ts:111-119` comments), so the discussion
branch does not touch the file loop or the GitHub-URL logic.

### 3.1 The guaranteed construction (what makes AC-1/AC-2 satisfiable)

The guarantee is structural, not a prompt sentence: `content` is BUILT by
iterating `work.discussion.initialPosts` under a fixed INITIAL-POST label and
`work.discussion.replies` under a fixed REPLY label. A reply's text is emitted
only under a reply label. It is therefore UNREPRESENTABLE for a reply to appear
labelled as an initial post - the property holds regardless of what the model
returns and regardless of truncation (truncation can only DROP a labelled
section, never RELABEL one). This is the G1 class the row demands
(`docs/backlog.yml:317`, "reply prose ... UNREPRESENTABLE"), reduced to what
recognition needs: not "the model never receives reply text" (that is the
exclusion guarantee, deferred), but "reply text, when received, is never
received as an initial post."

### 3.2 Exactly what the entry's content looks like

For a discussion with I initial posts and R replies, `content` is, in order:

1. A CODE-COMPOSED MANIFEST LINE built from the counts (see 3.3 for why it is
   first), for example:
   `This submission is a discussion contribution: 1 initial post and 2 replies to classmates. A reply is engagement with a classmate, not a second initial post; evaluate each contribution for what it is.`
   The counts `1` and `2` are `work.discussion.initialPosts.length` and
   `work.discussion.replies.length` - integers, not model output.

2. An initial-post section:
   - If I >= 1: `=== INITIAL POST ===` then the post text (each additional
     top-level post, if any, under `--- Initial post 2 ---` etc.).
   - If I == 0: `=== INITIAL POST ===` then the code-composed line
     `[This student did not write an initial post.]` (AC-4, section 6).

3. If R >= 1, a reply section: `=== REPLIES TO CLASSMATES ===` then, per reply,
   `--- Reply to <parentName> ---` (or `--- Reply ---` when the name is
   unresolved) followed by that reply's text. If R == 0 the reply section is
   omitted entirely.

Sections are joined with `\n\n`. `content` holds the FULL contribution text (not
preview-capped); the downstream cap is `truncateSubmission` at `engine.ts:224`.

### 3.3 Truncation survival is by construction of the manifest (INFO-3)

`truncateSubmission` keeps the FIRST `maxChars` characters (1.2). Placing the
manifest line FIRST makes it survive any realistic cap: the manifest is under
~250 characters, so for any `maxChars` above that it is present in what the
model receives even if a very long initial post later crowds out the reply
prose. Because the manifest is composed from the integer counts, the model is
ALWAYS TOLD there are R replies distinct from the initial post - the DISTINCTION
survives truncation unconditionally at any realistic cap, which is the exact bar
INFO-3 sets ("the reply distinction SURVIVES truncation"). At the 400000 default
the reply prose itself also survives in full.

This is deliberately NOT the disposed "prompt-sentence hope": that was one bullet
added to the shared system prompt, competing with ~30 rules over a single flat
blob (`docs/backlog.yml:317`, the "hope, not a guarantee" finding). This manifest
is PER-STUDENT DATA inside the submission content, composed by code from
`work.discussion`, front-loaded, and paired with the structural labelling of 3.1
and the `submittedFiles` recognition of 3.4 - which reaches the model and the UI
by a channel truncation cannot touch at all.

### 3.4 submittedFiles: one per contribution (AC-1, AC-5)

The discussion branch pushes one `SubmittedFileInfo` per contribution instead of
today's single `"Discussion post"` file (`extraction.ts:247-254`):

- Initial post: `{ name: "Initial post", extension: "(none)", previewContent: toPreviewContent(text).text, previewTruncated: toPreviewContent(text).truncated, mimeType: "text/plain" }`. Multiple top-level posts get `"Initial post 2"` etc.
- Reply: `{ name: "Reply to <parentName>", extension: "(none)", ... }`, or `"Reply"` when `parentName` is null. Names are made UNIQUE (a student with two replies to the same classmate gets `"Reply to Seth Vander Vorst"` and `"Reply to Seth Vander Vorst (2)"`), because `FilesCell` keys each `<li>` by `` `${student}-file-name-${file.name}` `` (`FilesCell.tsx:41`) - duplicate names would collide React keys.

`extension: "(none)"` is load-bearing twice: `FilesCell.tsx:43-47` renders the
bare label (no `.txt` suffix) when the extension is `"(none)"`, and
`buildSubmittedFileNamesBlock` drops these dotless names from the model's
filename-requirement list (`prompts.ts:273`) - both desired (1.2).

`submittedFiles` is a separate array on the entry; it is never passed to
`truncateSubmission`, so the per-contribution recognition it carries reaches the
entry (AC-1) and the results table (AC-5). NOTE (round-1 check BLOCKER-1
correction): `submittedFiles` is NOT a model-facing carrier - the discussion
labels use `extension: "(none)"` and dotless names, and
`buildSubmittedFileNamesBlock` (`prompts.ts:271-274`) filters base names to
`.includes(".")`, so the labels are DROPPED from the model's file-list block (this
is DESIRED, per section 1.2 - it must not be "fixed" by giving the labels a real
extension, which would inject fake filenames). The ONLY model-facing carrier of
recognition is the front-loaded manifest.

`parentName` resolution (discharges R7): `extractDiscussionActivity` already
builds `names: Map<number,string>` (`discussions.ts:48-53`) but only uses it for
the acting student (`fetchDiscussion:148`). This pass adds an optional
`parentName?: string` to `DiscussionPost` and sets it in
`extractDiscussionActivity` from `names.get(parentUserId)` when the reply is
pushed (`discussions.ts:62-70`). `canvasWorkToEntry` then reads
`reply.parentName` for the label. This is low cost (the map is already there) and
matches the owner's screenshot language ("@Seth Vander Vorst"). If the checker
prefers the minimal AC-5 bar, the label degrades to `"Reply"` and `parentName`
is dropped from the write set - but the design includes it and R7 is marked
discharged (section 16).

### 3.5 Other entry fields

`student`, `userId` from `work`. `mergedFileCount = Math.max(1, I + R)` (the
contribution count, matching the "files merged" display). `submissionUrl: null`,
`gradedRepo/gradedRef/repoReadNote: null` (discussions never have these). Return
shape is byte-identical to today's `StudentSubmissionEntry` - no new field.

## 4. Why no engine.ts / types.ts / utils.ts change (rejected alternatives)

Recorded so the checker can see the alternative was considered, not missed.

- 4.1 A section-aware `truncateSubmission` in `utils.ts` driven by a new
  `StudentSubmissionEntry.replySection` field, with `engine.ts` budgeting the
  two parts, would let the reply PROSE survive even an initial post larger than
  the whole cap. REJECTED: it touches `types.ts`, `extraction.ts`, `engine.ts`
  and `utils.ts` (4 files) to defend an input that does not occur (a single
  discussion post over 400000 characters - ~300 printed pages), and it splits
  `content` into two fields, so any future consumer that reads only `entry.content`
  silently drops replies. The manifest (3.3) delivers the required DISTINCTION
  survival at any realistic cap with zero change to `engine.ts`/`types.ts` and
  keeps `content` a single self-contained source of truth.
- 4.2 Pre-truncating inside `canvasWorkToEntry` (importing the cap) would fit
  `content` under the cap so the engine no-ops. REJECTED: it suppresses the
  `submissionTruncated` disclosure the engine computes (`engine.ts:258`,
  surfaced to the instructor per `FilesCell.tsx:67`), a shipped F3 guarantee -
  a silent regression to stay inside a file list.

Net: this round's PRODUCTION edits are `src/lib/grade/extraction.ts` and
`src/lib/canvas/discussions.ts` only. `engine.ts`, `types.ts`, `utils.ts`,
`rubric.ts`, `grading.ts`, `FilesCell.tsx`, `SubmittedFilesPanel.tsx` are
UNCHANGED.

## 5. contributionCount split (AC-3)

`grep -rn "contributionCount" src --include=*.ts` (2026-09-29): declaration
`discussions.ts:114`; three production writers `discussions.ts:152`,
`src/lib/canvas/submissions.ts:158` (always `1`), `src/app/actions/grading.ts:620`;
five fixtures in `src/lib/grade/extraction.test.ts:34,54,82,114,142`. Zero
readers in scoring or routing (confirmed; matches `docs/a8-scope.md` 1.3).

Design: ADD two OPTIONAL fields to `CanvasStudentWork`
(`discussions.ts:106-120`): `initialPostCount?: number` and `replyCount?: number`, (SHAPE-ONLY per scope 1.3 / round-1 check INFO-1: no RUNTIME reader - the manifest reads work.discussion.initialPosts.length/.replies.length directly, not these fields; they satisfy AC-3's split-the-count requirement structurally, mirroring contributionCount's zero-reader state, and are redundant with the .length values on discussion. Do not claim canvasWorkToEntry reads them.)
set ONLY in `fetchDiscussion` (`discussions.ts:152`) from
`activity.initialPosts.length` and `activity.replies.length`. Keep
`contributionCount` (write-only; removing it would touch two unrelated writers
and five fixtures for no reader). Making the new fields OPTIONAL is what keeps
`grading.ts:620` and `submissions.ts:158` (the other two `CanvasStudentWork`
literals) compiling UNCHANGED - so `grading.ts` stays untouched (section 12).

AC-3 pass: for a fixture with 1 initial post and 2 replies, `initialPostCount`
and `replyCount` are 1 and 2, distinct and non-equal. Failure: red if only one
combined number is reachable, or if the two are equal for an activity where they
differ.

## 6. Two distinct empty states (AC-4)

By construction of 3.2/3.4, the two states read differently with no extra code:

- Replies but no initial post (I==0, R>=1): manifest says "0 initial posts and R
  replies"; content shows `[This student did not write an initial post.]` under
  the INITIAL POST header; `submittedFiles` has no `"Initial post"` entry.
- Initial post but no replies (I>=1, R==0): manifest says "N initial post(s) and
  0 replies"; content has no REPLIES section; `submittedFiles` has no `"Reply"`
  entry.

The two states differ in the manifest counts, the content structure, and the
`submittedFiles` set. AC-4 failure: red if both collapse to the same signal.

## 7. UI (AC-5) - reuse, OV, no component change

`FilesCell.tsx:39-92` already renders `submittedFiles` as a list, one labelled
`<li>` per file (`:41-48`). Feeding it per-contribution files (3.4) makes it
render `Initial post`, `Reply to Seth Vander Vorst`, ... as separate labelled
rows with NO component edit. `SubmittedFilesPanel.tsx` follows the same contract.
Preview (Eye) works via `previewContent`; Download is hidden (no `rawBase64`,
`FilesCell.tsx:77`). No new CSS class is introduced (reuses `matrixFileList`/
`matrixFileItem`), so `page-module-css-orphan-classes.test.ts` (which writes
`docs/css-orphans.md` each run) shows no new path at the wave gate.

NO component is rendered by any test in this repo
(`docs/loop/this-repo.md`; MEMORY). AC-5 is therefore an OV (reading) claim:
the checker/implementer reads the `submittedFiles` array the discussion branch
returns and confirms each `name` distinguishes an initial post from a reply,
never both under one generic name (today always `"Discussion post"`,
`extraction.ts:249`). Failure: a built array with two entries (one initial, one
reply) sharing a name. Residual R5 (a running-app confirmation) stays owner/UX.

## 8. Score carrier (Fork B, item 4) - no new plumbing this round

Confirmed from 1.4: `rubricAreas: RubricAreaResult[]` (`types.ts:237`,
`RubricAreaResult = { area, score, comment }` `:39-43`) already carries any
number of named component scores, and `postCanvasGrades` (`grades.ts:133-143`)
already posts each name-matched area as its own `rubric_assessment[...]` entry.
A reply-section score, once R3's authoring surface exists, is simply one more
`RubricAreaResult` whose `area` matches the Canvas rubric's reply criterion - NO
new combination mechanism is needed for the per-criterion half.

This round adds ZERO score components: recognition does not score replies
separately, and (section 9) no rubric can carry a reply section yet, so every
rubric is single-section and the score stays one number. Fork B's "two
components" case cannot occur this round.

`deriveTotalScore` (`parsing.ts:175-203`) trusts a model-supplied total (`:179`)
and only sums `rubricAreas` otherwise. Whether a model total that ignores a
future reply component should be OVERRIDDEN by the code-derived sum is the real
open decision - it is MOOT until a reply criterion can exist, and is filed as R4
(section 16), not decided here. `deriveTotalScore` is UNCHANGED this round.

## 9. The reply-section rubric convention (item 3, R3) - designed, not built

`extractRubricCriteria` (`src/lib/grade/rubric.ts:27-31`) parses a FLAT list of
`{ name, points }` via a strict matcher (`:36-55`, requires a trailing colon
after `(N pts)`) with a widened fallback (`:97-`, no colon, parenthetical must
END the line) reached only when strict recovers zero (`:29-30`). There is no
section or grouping concept.

Recommended smallest, unambiguous, low-click house rule (the R3 spec):

- A REPLY-SECTION MARKER is a non-indented, non-empty line whose trimmed,
  lowercased text begins with `replies` or `reply section` AND carries no
  `(... pts)` parenthetical. Example authored rubric:
  ```
  Thesis (20 pts): clear, arguable claim
  Evidence (15 pts): sources cited

  Replies to classmates:
  Engagement (10 pts): responds substantively to a peer
  Civility (5 pts): respectful tone
  ```
- Why it is unambiguous: the "no parenthetical" condition means the marker can
  NEVER match either criterion matcher (both require a `(N pts)` group,
  `rubric.ts:43,103`), so a criterion line can never be mistaken for the marker
  and vice versa. It is detected in the SAME per-line loop, before the criterion
  match, so it survives the strict/widened fallback unchanged.
- Parse result: criteria before the marker are tagged `axis: "initial-post"`
  (the default), criteria after it `axis: "reply"`. `RubricCriterion`
  (`types.ts:459-463`) gains an optional `axis` tag when R3 is built.
- Grader application (R3, not this round): initial-post criteria score the
  initial post; reply criteria score the replies; and per RULING A the
  model-facing assignment instructions are narrowed in the SAME change so the
  model is not told to demand replies it is no longer scoring on the main axis.

Why this is NOT built this round, and why `rubric.ts` stays UNCHANGED (this
disproves the file list in the brief's item 5, which lists `rubric.ts` among
this round's changes):

- No authoring UI exists for an instructor to mark a reply section, so with the
  parser built, `axis: "reply"` would be reachable by NO input - a parser with
  no producer and no consumer is dead code, which this repo's own gate treats as
  a defect ("a group's file list must contain the file that CALLS the new
  export, or it ships dead", MEMORY / assignment-must-include-the-wiring-file).
- Exclusion/scoring is deferred by RULING A until the instructions are narrowed
  in the same change - not scoped this round.

So `rubric.ts` is design-only here. R3 (section 16) owns building it, with the
non-regression bar `rubric.ts:33-35,78-88` already states for its own matchers
(no rubric that parses today may change behaviour). I measured it anyway:
`@(Get-Content src/lib/grade/rubric.ts).Count` = 443 (PowerShell, 2026-09-29).

## 10. Route C and Route D boundary (item 6)

Route C (`gradeOneSubmissionAction`, `grading.ts:601-652`) has NO discussion
`/view` call - `fetchSubmissionDetail` builds `text` from `submission.body`
(`submission-detail.ts:120`) and never sets `discussion` (`docs/a8-scope.md`
1.2). The distinction is not reachable there without a NEW Canvas call. Route D
(`canvasWorkToZipBase64`, `submissions.ts:166-188`) packs `work.text` into a
`_post.txt` file read only by an external service (no in-repo reader:
`grep -rn "_post" src` excluding tests). Both stay OWNER-ONLY residuals R1/R2;
this pass designs neither. This round's `canvasWorkToEntry` change makes
`work.discussion` available to Route D's future work for free (the field is on
the shared `CanvasStudentWork`), but changes nothing on Route C or D.

## 11. Type signatures at the seams

- `src/lib/canvas/discussions.ts`:
  - `DiscussionPost` gains `parentName?: string;` (resolved display name of the
    replied-to user; undefined when unresolved).
  - `CanvasStudentWork` gains `initialPostCount?: number;` and
    `replyCount?: number;` (optional - only `fetchDiscussion` sets them).
  - `extractDiscussionActivity` and `fetchDiscussion` signatures UNCHANGED (they
    already return/emit the structures; only field population is added).
- `src/lib/grade/extraction.ts`:
  - `canvasWorkToEntry(work: CanvasStudentWork): Promise<StudentSubmissionEntry>`
    signature and return type UNCHANGED. A private helper, for example
    `buildDiscussionEntry(discussion: DiscussionActivity): { content: string; submittedFiles: SubmittedFileInfo[]; mergedFileCount: number }`,
    may be added inside `extraction.ts` for testability; it exports nothing new
    across a module boundary, so no barrel change.
- No change to `StudentSubmissionEntry` (`types.ts:424-446`), `SubmittedFileInfo`
  (`types.ts:119-126`), `RubricAreaResult`, or any export from `grade.ts` /
  `canvas.ts` (the barrels re-exporting these, `canvas.ts:24`).

## 12. File layout, sizes, and the 1000-line ceiling (item 5, R6)

Measured 2026-09-29 with `@(Get-Content <path>).Count` (PowerShell - the
mandated instrument; `wc -l` agreed on every file below this run):

| File | Now | This round | Projected | Ceiling |
|---|---|---|---|---|
| `src/lib/grade/extraction.ts` | 372 | +~55 (discussion branch + helper) | ~430 | 1000 |
| `src/lib/canvas/discussions.ts` | 158 | +~15 (2 fields, parentName, count split) | ~175 | 1000 |
| `src/lib/grade/rubric.ts` | 443 | 0 (design-only, section 9) | 443 | 1000 |
| `src/lib/grade/engine.ts` | 487 | 0 (section 4) | 487 | 1000 |
| `src/lib/grade/utils.ts` | 594 | 0 | 594 | 1000 |
| `src/lib/grade/types.ts` | 463 | 0 | 463 | 1000 |
| `src/app/components/grading-results/FilesCell.tsx` | 103 | 0 (reuse, section 7) | 103 | 1000 |
| `src/app/actions/grading.ts` | 977 | 0 (fields optional, section 5) | 977 | 1000 |

`LIMIT = 1000` at `src/file-size-ceiling.structure.test.ts:41`; no
`ALLOWED_OVERAGE` entry for any file above (`grep -n "grading.ts\|extraction.ts\|discussions.ts" src/file-size-ceiling.structure.test.ts` returns nothing).
No file this round approaches the ceiling; `grading.ts` at 977 is UNTOUCHED, which
item 5 required. R6 (re-measure `grading.ts` before any future wave that edits
it) stays as filed - no future wave here edits it.

## 13. Wave plan (dependency-ordered, disjoint write sets)

Two waves. Wave 1 is the source-of-data change; Wave 2 depends on it (the entry
branch reads the fields and `parentName` Wave 1 adds).

- WAVE 1 - discussion source data. Write set:
  `src/lib/canvas/discussions.ts` (+`parentName` on `DiscussionPost`, its
  resolution in `extractDiscussionActivity`; `initialPostCount`/`replyCount` on
  `CanvasStudentWork`, set in `fetchDiscussion`) and its test
  `src/lib/canvas.test.ts` (extends the existing `extractDiscussionActivity`
  suite at `:27-`, adds `fetchDiscussion` count/`parentName` cases). Delivers
  AC-3, and the `parentName` input Wave 2 labels with. CALLER of the new fields:
  `fetchDiscussion` itself (Wave 1) and `canvasWorkToEntry` (Wave 2) - so no
  field ships without a reader.
- WAVE 2 - entry construction. Write set: `src/lib/grade/extraction.ts`
  (discussion branch, section 3) and `src/lib/grade/extraction.test.ts`
  (discussion fixtures for AC-1, AC-2, AC-4, and the truncation-survival oracle
  of section 14). CALLER of `canvasWorkToEntry`'s new behaviour:
  `gradeCanvasUrl` (`engine.ts:471-472`), already live - not edited, but it is
  the production caller that reaches the branch.

Sequence, do not parallelise: Wave 2 reads fields and `parentName` Wave 1 adds
(a directional informational coupling, same reason A8-R and A8-P were sequenced,
`docs/backlog.yml:317`). The write sets are path-disjoint
(`discussions.ts`/`canvas.test.ts` vs `extraction.ts`/`extraction.test.ts`) but
the data dependency forbids concurrency.

## 14. Test oracles this design implies (for the test-author seat)

These are the pass/fail shapes the design must be measured by; the test-author
owns exact fixtures.

- AC-1 (`extraction.test.ts`): a `CanvasStudentWork` with
  `discussion.initialPosts=[one]`, `discussion.replies=[one]`. Assert the
  returned entry's `submittedFiles` contains one entry named `"Initial post"`
  and one whose name starts `"Reply"` - distinct names. Failure: they share a
  name or the reply is absent.
- AC-2 UNMERGED (`extraction.test.ts`): assert the returned `content` contains
  the manifest line, the `=== INITIAL POST ===` header, and the
  `=== REPLIES TO CLASSMATES ===` header, and that reply text appears only after
  the reply header. Failure: `content` equals the pre-fix flat `work.text` shape.
- AC-2 TRUNCATION SURVIVAL (`extraction.test.ts`): mock
  `getGeminiMaxCharsPerSubmission` to a REALISTIC value and, in a second case,
  to a value SMALLER than a deliberately long initial post but larger than the
  manifest. Apply `truncateSubmission(entry.content, cap)` and assert the
  manifest's reply COUNT is still present post-truncation in BOTH cases. This is
  the load-bearing oracle. It MUST NOT use the `engine.test.ts:8` cap of 20 (the
  wrong-reason trap, `docs/backlog.yml:317`): at 20 even the manifest is cut, so
  the assertion would pass on broken code. The realistic-cap case must also
  assert the initial-post header is present (proving the fix is not stripping the
  wrong section).
- AC-3 (`canvas.test.ts`): fixture 1 initial + 2 replies; assert
  `initialPostCount===1`, `replyCount===2`. Failure: either absent or equal.
- AC-4 (`extraction.test.ts`): two entries, one I==0/R==1 and one I==1/R==0;
  assert their `content` and `submittedFiles` differ (the "no initial post" note
  present in one, absent in the other). Failure: identical signal.
- `parentName` (R7, `canvas.test.ts`): a reply whose `parentUserId` is a known
  participant; assert `parentName` equals that display name, not the bare id.

## 15. Leverage note

A8 is a `kind: bug` row (`docs/backlog.yml:309`), so per `docs/loop/leverage.md`
("Failure mode A" and the Criteria step) no NEW leverage CLAIM is authored; the
class is inherited. Recording the fired trigger honestly: this fix PROTECTS an
existing SCALE/GUARANTEED-class advantage the app has over a chat -
`gradeStudentEntries` grades a whole batch against one pinned rubric
(`leverage.md` SCALE row, `engine.ts:186`), and the app holds the
per-contribution structure Canvas returns that a chat, handed a flat paste,
cannot recover. The defect ERODED that advantage by flattening the structure back
into an undifferentiated blob; recognition restores it. No removal test is owed
because no new claim is made; the AC-2 unmerged/truncation oracles above are the
correctness guards.

## 16. Residual register

Each entry: owner, instrument, step. Carried from `docs/a8-scope.md` section 6,
updated where this pass changes a disposition. A residual not in `docs/BACKLOG.md`
(or the A8 row in `docs/backlog.yml`) does not exist - the push must reconcile
these into the A8 row.

- R1 - Route C discussion recognition, unverifiable without a live Canvas call.
  UNCHANGED. Owner: repo owner. Instrument: one live single-submission grade
  through `gradeOneSubmissionAction` against a real graded discussion. Step:
  after a future wave gives that route a `/view` call (not this round; AC-8).
- R2 - Route D `_post.txt` / external Deterministic Grading API, unverifiable
  without a live call. UNCHANGED (`grep -rn "_post" src` excluding tests still
  finds no in-repo reader). Owner: repo owner. Instrument: one run against the
  live external service. Step: before any change to what `canvasWorkToZipBase64`
  writes (not this round; AC-6).
- R3 - the reply-section rubric authoring surface, parsing convention, and
  grader application. DESIGNED here (section 9) but NOT built. Owner: the next
  A8 activity (a wave built from this design's section 9). Instrument: the
  parsing convention plus the non-regression bar `rubric.ts:33-35,78-88` already
  states (no rubric that parses today changes behaviour), and an authoring-UI
  surface for the marker. Step: before any implementer wave edits `rubric.ts`
  for this feature.
- R4 - whether a model-supplied total that ignores a future reply component
  should be overridden by `deriveTotalScore`'s sum. MOOT until R3 ships. Owner:
  whoever scopes R3. Instrument: re-examine `parsing.ts:175-203` and
  `grades.ts:128-143` once a reply criterion can exist. Step: that future scope.
- R5 - AC-5's UI claim is OV (reading), not rendered (no component renders under
  vitest). Owner: the verify/UX pass at implementation time. Instrument: a manual
  check or screenshot in the running app. Step: after Wave 2, before it ships.
- R6 - `grading.ts` line budget (977/1000, no `ALLOWED_OVERAGE`,
  `file-size-ceiling.structure.test.ts:41`). UNCHANGED by this round (section 12);
  stays as a standing check for any FUTURE wave that edits `grading.ts`. Owner:
  the wave-plan seat of that future wave. Instrument:
  `@(Get-Content src/app/actions/grading.ts).Count` vs `LIMIT`. Step: before that
  wave starts.
- R7 - labelling a reply with WHO it replied to. DISCHARGED by this design
  (section 3.4): `DiscussionPost.parentName` resolved from the existing `names`
  map, used in the reply label, with a `canvas.test.ts` oracle (section 14). If
  the checker prefers the minimal AC-5 bar (bare `"Reply"`), R7 reverts to OPEN
  with owner = Wave 2 implementer.
- R8 - `contributionCount`'s zero-readers state should be re-confirmed at
  implementation time. Owner: Wave 1 implementer. Instrument:
  `grep -rn "contributionCount" src` re-run immediately before the change, plus
  `tsc` after. Step: Wave 1. (This design ADDS fields rather than removing
  `contributionCount`, so the risk is smaller than the scope assumed, but the
  re-confirm stands.)

## 17. owns / write-set, derived from the tree

Derived with (2026-09-29):
`grep -rln "canvasWorkToEntry" src` and
`grep -rln "extractDiscussionActivity\|fetchDiscussion\|contributionCount\|matrixFileList\|buildSubmittedFileNamesBlock" src`.
Pasted classifications:

EDITED (production):
- `src/lib/canvas/discussions.ts` - Wave 1 (fields, `parentName`, count split).
- `src/lib/grade/extraction.ts` - Wave 2 (`canvasWorkToEntry` discussion branch).

EDITED (tests, owned):
- `src/lib/canvas.test.ts` - Wave 1 (extends `extractDiscussionActivity` suite at
  `:27`; adds `fetchDiscussion` counts + `parentName`).
- `src/lib/grade/extraction.test.ts` - Wave 2 (discussion fixtures; today's five
  fixtures at `:34,54,82,114,142` have no `discussion` field so they take the
  unchanged `work.text` path and stay green).

CHECKED-SAFE (read the string they own or call the symbol; must stay green; no
edit expected):
- `src/lib/grade/engine.ts` - calls `canvasWorkToEntry` at `:471-472`; signature/
  return shape unchanged, so it compiles and behaves unchanged.
- `src/lib/grade/rubric-stamp.wiring.test.ts`, `src/app/actions/grading.guard.test.ts`,
  `src/app/actions/action-guard-coverage-github-cohort.test.ts`,
  `src/app/components/grading-results/gradingResultsHelpersEditState.test.ts` -
  reference `canvasWorkToEntry`; none asserts on the discussion branch.
- `src/app/components/grading-results/FilesCell.tsx`,
  `src/app/components/grading-results/SubmittedFilesPanel.tsx`,
  `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts`,
  `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` -
  render/assert `submittedFiles`/`matrixFileList`; per-contribution files use the
  existing contract, so they render distinctly with no edit (section 7).
- `src/lib/canvas.ts` (barrel, `:24`), `src/lib/canvas/work.ts` (calls
  `fetchDiscussion`), `src/lib/canvas/submissions.ts:158`,
  `src/app/actions/grading.ts:620` - the other two `CanvasStudentWork` literals;
  compile unchanged because the new count fields are OPTIONAL.
- `src/lib/grade/prompts.ts` (`buildSubmittedFileNamesBlock`) - relied upon to
  DROP the dotless contribution labels (`:273`); not edited.

No structure test enumerates `CanvasStudentWork` or `SubmittedFileInfo` keys
(`grep -rln "CanvasStudentWork" src --include=*.structure.test.ts` returns
nothing), so the optional-field additions trip no field-count canary. No new CSS
class is added, so `page-module-css-orphan-classes.test.ts` shows no new path.

## 18. Disposition of prior artifact content

No prior `docs/a8-architecture.md` existed
(`ls docs/a8*.md` before this write shows `a8-scope.md` and `a8r-scope.md` only),
so there is no prior version of THIS artifact to map requirement-by-requirement.
Every residual from the checked scope (`docs/a8-scope.md` R1-R8) is carried into
section 16 with its owner/instrument/step, updated only where this pass changes a
disposition (R3 now has a design; R7 discharged; R8 risk reduced).

## 19. What could not be determined here (environment limits)

Per `docs/loop/this-repo.md` section 6 and MEMORY:
- No live Canvas call: every claim about the `/view` response shape rests on
  reading `extractDiscussionActivity`/`fetchDiscussion` and their types, not a
  live response.
- No component renders under vitest: AC-5 is OV (section 7), and R5 records the
  running-app confirmation as owner/UX work. No requirement in this design is
  enforced only by a render.
- No live external Deterministic Grading API call: Route D's tolerance for any
  changed shape is unknown; not touched this round (R2).
