# A8 remainder - test notes and frozen oracles (round 1)

Test notes and oracle design only. No production code and no test code was
written or changed to produce this document. Consumer: the `loop-implementer`
who writes the Wave 1 and Wave 2 test code. A fresh `loop-checker` gates this
first. Every quantity below names the command that produced it; every
`file:line` was opened this session.

Source artifacts, read in full this session: `docs/a8-architecture.md`,
`docs/a8-scope.md`, and the A8 row `docs/backlog.yml:307-318`. Real code opened:
`src/lib/grade/extraction.ts:221-372`, `src/lib/canvas/discussions.ts:1-158`,
`src/lib/grade/engine.ts:210-269`, `src/lib/grade/utils.ts:1-66`,
`src/lib/grade/prompts.ts:260-283`, `src/lib/canvas.test.ts:1-57`,
`src/lib/grade/extraction.test.ts:1-160`, `vitest.setup.ts`,
`src/lib/gemini.ts:136-141`, `src/lib/canvas-fetch-response.ts:1-40`.

## 0. Scope of what these notes measure

Recognition on Route A only, two waves (per `docs/a8-architecture.md` section 13):

- WAVE 1 - `src/lib/canvas/discussions.ts` + its test `src/lib/canvas.test.ts`
  (`parentName` resolution; `initialPostCount`/`replyCount` shape fields).
- WAVE 2 - `src/lib/grade/extraction.ts` + its test
  `src/lib/grade/extraction.test.ts` (the `canvasWorkToEntry` discussion branch:
  manifest, sections, per-contribution `submittedFiles`, empty states,
  truncation survival).

Exclusion, reply scoring, and the reply-section rubric are DESIGNED but NOT
built this round (`a8-architecture.md` section 9); no oracle here measures them.
Routes C and D are owner-only residuals; no oracle here measures them.

The whole recognition guarantee reduces to one property (the G1 class,
`docs/backlog.yml:317`): **reply text, when the model receives it, is never
received as an initial post.** Truncation can DROP a labelled section but can
never RELABEL one, and the counts that carry the distinction ride a
front-loaded manifest that survives a prefix slice. REQ-2, REQ-3 and REQ-5 are
the load-bearing oracles for that property.

## 1. Environment constraints these oracles obey (measured)

- **Network is blocked, but only on the global `fetch`.** `vitest.setup.ts`
  replaces `fetch` with a throwing stub AND states in its own comment:
  "`canvasFetch` dials through `node:https` rather than `fetch`, so a test that
  mocks neither could still reach the network through that path." `fetchDiscussion`
  (`discussions.ts:122-158`) reaches Canvas via `canvasGet`
  (`discussions.ts:6`, from `../canvas-fetch-response`), which is the
  `node:https` path - NOT `fetch`. Therefore REQ-4 (the only network oracle here)
  MUST mock `canvasGet`, never `fetch`. A live 401 once made a sabotage pass
  (MEMORY: tests-are-network-blocked); the same trap applies here.
- **The `canvasGet` mock must answer BOTH calls `fetchDiscussion` makes.**
  `fetchDiscussion` runs `Promise.all([canvasGet(view), fetchDiscussionDueAt(...)])`
  (`discussions.ts:130-133`), and `fetchDiscussionDueAt` (`:86-104`) makes a
  SECOND `canvasGet` to the `discussion_topics/{id}` endpoint. A mock that returns
  one shape for all calls is acceptable if the `/view` shape and the due-date shape
  do not collide; the cleanest mock branches on the URL (`.endsWith("/view")`).
  Idiom to copy verbatim: `src/app/actions/canvas-inbox.weekly-announcement-schedule.sequential-fetch.test.ts:71-72`
  (a `vi.mock` of `@/lib/canvas-fetch-response` whose factory returns
  `canvasGet: vi.fn()`).
- **No cross-`*.test.ts` import** (MEMORY: no-cross-test-file-imports). WAVE 1
  oracles live in `src/lib/canvas.test.ts`, WAVE 2 in
  `src/lib/grade/extraction.test.ts`; neither imports a helper from the other or
  from any third `*.test.ts`. Duplicate any shared fixture.
- **No `/s` dotAll flag** (MEMORY: regex-s-flag-fails-tsc; passes vitest, fails
  `tsc` TS1501). Use `[\s\S]` in every multiline regex below.
- **Multi-file run uses the wrapper.** To run both suites in one command:
  `npm run test:paths -- src/lib/canvas.test.ts src/lib/grade/extraction.test.ts`
  (`package.json:21`). A raw `vitest run a b` drops unmatched paths and exits 0
  (MEMORY: test-paths-wrapper). Each suite alone runs as usual under `vitest run`.
- **No component renders under vitest** (MEMORY; `docs/loop/this-repo.md`). AC-5's
  pixels are OV; see REQ-6 and residual R5. No oracle here is enforced by a render.

## 2. Frozen fixtures, stated as constructions

All fixtures are hand-built `CanvasStudentWork` / `CanvasViewResponse` literals -
constructible from the tree because both types are exported and their fields are
public (`discussions.ts:9-23,106-120`). The sentinel texts are chosen to be
unique substrings so index-ordering assertions cannot match the wrong region.

- **FIX-A (WAVE 2, one of each):** `work.discussion = { initialPosts: [{ text: "INITIALSENTINEL_alpha", createdAt: null, isReply: false, parentUserId: null }], replies: [{ text: "REPLYSENTINEL_bravo", createdAt: null, isReply: true, parentUserId: 1, parentName: "Alice Adams" }] }`,
  and ALSO `work.text = "Post: INITIALSENTINEL_alpha\n\n---\n\nReply: REPLYSENTINEL_bravo"`,
  `work.files = []`, `contributionCount: 2`. Setting `work.text` mirrors what
  `fetchDiscussion` really produces (`discussions.ts:143-146`) and makes REQ-1's
  "no `Discussion post` pseudo-file" assertion meaningful: current code takes the
  `work.text` branch and emits `"Discussion post"`.
- **FIX-B (WAVE 2, counts 1 initial / 2 replies):** like FIX-A but
  `replies` has two entries (`REPLYSENTINEL_bravo`, `REPLYSENTINEL_charlie`).
  Used for REQ-2 fixture (a).
- **FIX-C (WAVE 2, counts 2 initial / 1 reply):** two initial posts
  (`INITIALSENTINEL_alpha`, `INITIALSENTINEL_delta`), one reply
  (`REPLYSENTINEL_bravo`). Used for REQ-2 fixture (b) - the anti-vacuity twin.
- **FIX-D (WAVE 2, huge initial, one reply):** one initial post whose text is
  `"INITIALSENTINEL_alpha" + "x".repeat(50000)`, one reply `REPLYSENTINEL_bravo`.
  Used for REQ-3 (truncation survival). 50000 is far above any realistic cap in
  the SMALL-cap case and far below the 400000 default in the realistic case.
- **FIX-E (WAVE 2, replies but no initial):** `initialPosts: []`,
  `replies: [{ text: "REPLYSENTINEL_bravo", ... }]`. Used for REQ-5 and REQ-2's
  I==0 manifest case.
- **FIX-F (WAVE 2, initial but no replies):** `initialPosts: [{ text: "INITIALSENTINEL_alpha", ... }]`,
  `replies: []`. Used for REQ-5.
- **FIX-G (WAVE 2, period in parentName - ADVERSARIAL):** one reply with
  `parentName: "Dr. Alan Turing"`. Used for REQ-7 (the model-leak guard). The
  period is the whole point; see the finding in section 5.
- **FIX-H (WAVE 1, `/view` response):** REUSE the existing `view` literal already
  in `src/lib/canvas.test.ts:6-25` (Alice's post with two replies, Bob's own
  post). It already yields one user with 1 initial + 1 reply and one with 1 initial
  + 1 reply, and a reply whose parent is Alice. For REQ-4's distinct-count fixture,
  add ONE more reply under Alice by Bob so Bob has 1 initial + 2 replies, giving a
  user with non-equal counts (1 and 2). Build a fresh literal in the WAVE 1 suite;
  do not import it from anywhere.

## 3. The requirements

Each: object under comparison / instrument / direction of failure, then a named
sabotage with its discrimination verdict. "RED-by-construction" means the feature
does not exist yet, so the oracle is already RED on `HEAD` before any Wave lands -
stated honestly per this seat's mandate; the implementer proves GREEN after build.

### REQ-1 (AC-1) - the entry carries the initial/reply distinction as files

- **Object:** the `submittedFiles` array of
  `await canvasWorkToEntry(FIX-A)` (the exported production function
  `extraction.ts:238`, driven directly - the same function `gradeCanvasUrl`
  loops at `engine.ts:471-472`; do NOT import a private helper).
- **Instrument:** `src/lib/grade/extraction.test.ts`, `vitest run`.
- **Assertions:**
  1. exactly one entry with `name` matching `/^initial post/i`;
  2. at least one entry with `name` matching `/^repl/i`;
  3. those two names are not equal;
  4. NO entry with `name === "Discussion post"` (proves the discussion branch
     REPLACED the `work.text` branch and both did not run).
- **Direction of failure:** RED if the reply file is absent, shares a name with
  the initial file, or a generic `"Discussion post"` pseudo-file remains.
- **RED-by-construction:** yes. On `HEAD`, FIX-A has `work.text` set, so
  `canvasWorkToEntry` pushes one `"Discussion post"` file (`extraction.ts:248-254`)
  and no `/repl/` file. Assertions 2 and 4 both fail RED today.
- **Sabotage S1 (WAVE 2):** in the discussion branch, delete the loop that pushes
  reply files (build only initial-post files). Assertion 2 goes RED; restore, GREEN.
  **Discriminates: yes.**
- **Self-attack:** an implementation that keeps BOTH branches (discussion branch
  plus the untouched `if (work.text)` block) passes 1-3 but FAILS 4 - which is why
  assertion 4 exists. Without it the oracle would greenlight a double-emit that
  ships every reply twice and re-adds the flat blob.

### REQ-2 (AC-2, model-facing distinction) - the front-loaded manifest states the counts

- **Object:** the manifest region of `(await canvasWorkToEntry(work)).content` -
  the substring before the first section header (equivalently, before the first
  `"\n\n"`). The manifest is the ONLY model-facing carrier of recognition
  (`a8-architecture.md` BLOCKER-1 correction, section 3.4): do NOT write an
  oracle asserting the labels appear in the model's file-list block - they are
  dropped there by design (REQ-7 verifies the drop).
- **Instrument:** `src/lib/grade/extraction.test.ts`, `vitest run`. TWO frozen
  fixtures with DISTINCT count shapes (this is the anti-vacuity guard):
  - (a) FIX-B (1 initial, 2 replies): the manifest matches `/(\d+)\s+initial post/i`
    with capture group `=== "1"`, and matches `/(\d+)\s+repl(y|ies)/i` with
    capture group `=== "2"`.
  - (b) FIX-C (2 initial, 1 reply): the same two regexes capture `"2"` and `"1"`.
- **Direction of failure:** RED if the manifest is absent, or a count does not
  match the fixture's array length, or the two counts are swapped.
- **Altitude note (MEMORY: source-text-tests-overspecify):** the oracle pins the
  FACT (each count is a digit adjacent to and BEFORE its noun) and the ORDERING,
  not the exact sentence. The implementer may word the manifest freely and may
  pluralise as they like; `repl(y|ies)` tolerates both. The digit-before-noun
  adjacency is load-bearing and is the fact, so it is pinned.
- **RED-by-construction:** yes. `HEAD` builds no manifest; both regexes fail.
- **Sabotage S2a (swap):** in the manifest builder, read the reply count from
  `initialPosts.length` and vice versa. On FIX-B the captures become `"2"`/`"1"`;
  assertion (a) goes RED. Restore, GREEN. **Discriminates: yes** (the counts differ
  in the fixture, so a swap is visible).
- **Sabotage S2b (hardcode - the vacuity attack I ran against my own oracle):**
  replace the composed manifest with the constant literal
  `"1 initial post and 2 replies to classmates."`. Fixture (a) PASSES (it happens
  to match), fixture (b) FAILS RED (it captures `"1"`/`"2"`, not `"2"`/`"1"`).
  **Discriminates: yes.** This proves a single fixture would be defeated by a
  constant; BOTH fixtures are required. If a checker sees only one count fixture,
  that is the defect.

### REQ-3 (AC-2, truncation survival) - the distinction survives a prefix slice

THE load-bearing oracle. It drives the REAL production truncation function
`truncateSubmission` (`utils.ts:15-28`), which the engine calls at
`engine.ts:224` - so the test exercises the exact seam production uses, not a
reimplementation.

- **Object:** `truncateSubmission((await canvasWorkToEntry(FIX-D)).content, cap)`.
- **Instrument:** `src/lib/grade/extraction.test.ts` importing `truncateSubmission`
  from `../grade/utils` (production pure function; not a `*.test.ts`), `vitest run`.
- **Two cases:**
  - SMALL-cap case: `cap = 2000`. Assert `result.truncated === true` (the anchor -
    see the vacuity self-attack below), AND `result.text` matches the reply-count
    regex `/(\d+)\s+repl(y|ies)/i` with capture `=== "1"`, AND `result.text`
    matches an initial-section marker `/initial/i` (proving the slice kept the
    right front section, not the wrong one). The reply PROSE
    (`REPLYSENTINEL_bravo`, sitting after 50000 chars) is expected ABSENT - do not
    assert on it; AC-2 requires the DISTINCTION to survive, not the prose.
  - REALISTIC-cap case: `cap = 400000` (the production default,
    `gemini.ts:136-141`, `gemini.test.ts:24`). Assert `result.truncated === false`
    AND `result.text` contains `REPLYSENTINEL_bravo` (full prose survives at the
    real cap).
- **Direction of failure:** RED if, at the small cap, the reply count is gone from
  `result.text` (i.e. the manifest was not front-loaded and got sliced off).
- **Cap constraints, stated so the wrong-reason trap cannot recur** (row
  `docs/backlog.yml:317`, "at that cap `truncateSubmission` would strip reply text
  REGARDLESS of the fix"): the small cap MUST be strictly greater than the manifest
  length plus the initial-section header length (so a correct front-loaded manifest
  survives) and strictly less than that plus the initial-post length (so truncation
  actually fires). With FIX-D's 50000-char initial post, any cap in roughly
  [500, 49000] satisfies both; 2000 is chosen with margin. The oracle MUST NOT use
  the `engine.test.ts:8` cap of 20: at 20 even the manifest is cut, so a correct
  implementation would fail RED there - a false RED, the wrong-reason trap in the
  opposite direction.
- **RED-by-construction:** yes. `HEAD` has no manifest, so the reply count is not
  present at any cap.
- **Sabotage S3 (the front-loading is load-bearing):** in the content builder,
  place the manifest AFTER the initial-post section instead of first. At `cap=2000`
  the manifest (now sitting after 50000 chars) is sliced off; the reply-count
  regex fails on `result.text`. RED. Restore (manifest first), GREEN.
  **Discriminates: yes.** This is the sabotage that proves front-loading, not just
  manifest-presence, is what AC-2 buys.
- **Self-attack (the trap INFO-3 names, `a8-scope.md:180-187`):** an oracle that
  asserted on `entry.content` BEFORE calling `truncateSubmission` would PASS S3
  (the manifest is present pre-truncation) and greenlight broken code. This oracle
  asserts only on `truncateSubmission`'s OUTPUT. Second self-attack (silent
  widening, MEMORY analog): if `cap >= content.length` nothing is cut and survival
  is trivial; the `result.truncated === true` assertion is the both-ends anchor
  that forbids a too-large cap from passing vacuously.

### REQ-4 (AC-3, count split) - SHAPE-ONLY, on the network path

- **Object:** the `initialPostCount` and `replyCount` fields of the
  `CanvasStudentWork` that `fetchDiscussion` builds for a user with 1 initial post
  and 2 replies (FIX-H extended).
- **Instrument:** `src/lib/canvas.test.ts` with `canvasGet` MOCKED (section 1),
  `vitest run`. `extractDiscussionActivity` is pure and needs no mock, but
  `fetchDiscussion` is the ONLY writer of the two new fields
  (`a8-architecture.md` section 5), so this oracle must go through `fetchDiscussion`
  and therefore through the `canvasGet` mock.
- **Assertions:** for that user, `initialPostCount === 1` and `replyCount === 2`
  (distinct, non-equal).
- **Direction of failure:** RED if either field is absent (`undefined`), if only a
  single combined count is reachable, or if the two are equal for an activity where
  they differ.
- **SHAPE-ONLY honesty (scope 1.3; `a8-architecture.md` INFO-1):** these fields
  have NO runtime reader - the manifest reads
  `work.discussion.initialPosts.length`/`.replies.length` directly, not these
  fields, which are redundant with those `.length` values. This oracle pins their
  VALUES as the structural AC-3 evidence; it does NOT and cannot assert a
  downstream behavioural effect, because there is none. Do not claim
  `canvasWorkToEntry` reads them.
- **RED-by-construction:** yes. The fields do not exist on `HEAD`;
  `initialPostCount` is `undefined`.
- **Sabotage S4 (copy-paste bug):** set `replyCount` from
  `activity.initialPosts.length`. Then `replyCount === 1 !== 2`. RED. Restore,
  GREEN. **Discriminates: yes** (the fixture's two counts differ).
- **Network self-attack:** if the implementer mocked `fetch` instead of
  `canvasGet`, `canvasGet`'s `node:https` path would either reach the real host or
  throw from `canvasFetch`; the sabotage could pass or the test could false-green
  on a live response. The oracle spec REQUIRES the `canvasGet` mock and the
  `.endsWith("/view")` branch; a checker seeing a `fetch` mock here should fail it.

### REQ-5 (AC-4, two distinct empty states) - "no initial" differs from "no replies"

- **Object:** the `content` and `submittedFiles` of `canvasWorkToEntry(FIX-E)`
  versus `canvasWorkToEntry(FIX-F)`.
- **Instrument:** `src/lib/grade/extraction.test.ts`, `vitest run`.
- **Assertions:**
  1. `FIX-E.content` matches an "absent initial post" marker (loose regex, e.g.
     `/no initial post|did not (write|post)[\s\S]{0,40}initial/i`) and
     `FIX-F.content` does NOT match it;
  2. `FIX-E.submittedFiles` has no entry with `name` matching `/^initial post/i`;
     `FIX-F.submittedFiles` has no entry with `name` matching `/^repl/i`;
  3. `FIX-E.content !== FIX-F.content`.
- **Direction of failure:** RED if both states collapse to the same signal
  (e.g. both emit the same generic placeholder, or both read only as a low count).
- **Altitude note:** the marker regex pins the FACT (an absent-initial-post note
  exists in one and not the other), not exact wording. The `submittedFiles`
  structural checks (assertion 2) are byte-precise and spelling-independent - they
  are the stronger half.
- **RED-by-construction:** yes. `HEAD` emits `"Discussion post"` for both FIX-E and
  FIX-F, so assertions 1 and 3 fail (identical signal).
- **Sabotage S5:** emit the SAME placeholder for both empty cases (e.g. always push
  a single `"[no contribution]"` note regardless of which bucket is empty). FIX-E
  and FIX-F `content` converge; assertion 3 goes RED. Restore, GREEN.
  **Discriminates: yes.**
- **Self-attack:** a sabotage that only changed the reply side would leave
  assertion 1 GREEN; assertion 3 (full inequality) plus assertion 2 (both
  structural sets) is what makes S5 discriminate regardless of which side collapses.

### REQ-6 (AC-5, UI recognition) - source-checkable structure only; pixels are OV

- **Object:** the `name` of each `submittedFiles` entry a discussion produces.
- **Instrument:** the SAME source-checkable assertions as REQ-1 (distinct
  `"Initial post"` vs `/^repl/i` names, never a shared generic
  `"Discussion post"`). `FilesCell.tsx:41-48` renders one `<li>` per file keyed by
  `file.name`, so distinct names render as distinct rows WITH NO component edit -
  but this is not exercised by any test here.
- **Direction of failure:** RED (via REQ-1) if two contributions share a name.
- **OV boundary, stated as required by this seat's mandate:** the actual rendered
  rows, focus, and keyboard behaviour are NOT enforceable under vitest (no
  component renders; MEMORY, `docs/loop/this-repo.md`). There is NO render oracle
  here. The pixel confirmation is residual R5 (owner/UX). REQ-6 asserts nothing
  beyond REQ-1; it exists to name AC-5's split between the source-checkable part
  (done) and the render part (OV).
- **Uniqueness note (name collisions):** a student with two replies to the same
  classmate would produce two identical `"Reply to X"` names, colliding
  `FilesCell`'s React key (`FilesCell.tsx:41`, `` `${student}-file-name-${file.name}` ``).
  `a8-architecture.md:206` requires disambiguation (`"Reply to X (2)"`). Recommended
  supplementary oracle (WAVE 2, `extraction.test.ts`): a fixture with two replies
  whose `parentName` is identical; assert the two `submittedFiles` names are not
  equal. Direction: RED if they collide. Sabotage: drop the uniquing suffix; RED.
  **Discriminates: yes.** Flagged as recommended, not mandated, because AC-5 as
  written requires only distinguishing initial-from-reply, not reply-from-reply;
  routed to the checker as a decision (section 6, D-2).

### REQ-7 (regression guard) - contribution labels must not leak into the model file-list block

This verifies the architecture's own load-bearing claim
(`a8-architecture.md` sections 1.2, 3.4): the discussion labels are DROPPED from
`buildSubmittedFileNamesBlock` and that drop is DESIRED. I attacked that claim and
found it FALSE for one input class - see the finding in section 5. This oracle
freezes the invariant and uses the adversarial input that breaks the naive build.

- **Object:** `buildSubmittedFileNamesBlock((await canvasWorkToEntry(work)).submittedFiles)`
  (the REAL production function, `prompts.ts:270-283`, imported from `../grade/prompts`;
  it is what `engine.ts:74` feeds the model).
- **Instrument:** `src/lib/grade/extraction.test.ts`, `vitest run`, with TWO fixtures:
  - (a) FIX-A (dot-free labels): assert the returned block does NOT contain
    `"Initial post"` and does NOT contain the reply label text.
  - (b) FIX-G (ADVERSARIAL, `parentName: "Dr. Alan Turing"`): assert the returned
    block does NOT contain `"Reply to Dr"` / the reply label. This is the case the
    naive `name: "Reply to " + parentName` build FAILS.
- **Direction of failure:** RED if any contribution label appears in the block
  (the model would then be told a file named e.g. `"Reply to Dr. Alan Turing"`
  exists, corrupting the filename-requirement feature the block serves).
- **Why an invariant, not a denylist:** the oracle does not enumerate forbidden
  strings; it freezes the property "no discussion contribution label reaches the
  file-list block" and drives the real filter, so any label shape that leaks is
  caught. The fix that makes the bad state unrepresentable is to build the
  `submittedFiles.name` with no `"."` (see reference sketch, section 4), so the
  `getBaseFileName(name).includes(".")` filter (`prompts.ts:271-274`) drops it
  unconditionally. The content section keeps the full `parentName` (periods there
  are harmless).
- **RED-by-construction:** partially. Fixture (a) is GREEN even on `HEAD` (no
  labels exist to leak). Fixture (b) is the discriminating one and is RED on any
  naive implementation that copies `parentName` verbatim into the file name.
- **Sabotage S7:** build the reply file name as `"Reply to " + parentName` with no
  dot-stripping. Fixture (b) goes RED (`getBaseFileName("Reply to Dr. Alan Turing").includes(".")`
  is `true`, so the block lists it). Restore (dot-free name), GREEN.
  **Discriminates: yes** - and note fixture (a) alone does NOT discriminate S7
  (dot-free names never leak), which is exactly why the adversarial fixture (b) is
  mandatory. A checker seeing only fixture (a) should fail this oracle.

### REQ-8 (R7, parentName resolution) - a reply names WHO it replied to

- **Object:** `reply.parentName` for a reply whose `parentUserId` is a known
  participant, from `extractDiscussionActivity` (PURE function, `discussions.ts:44-82`).
- **Instrument:** `src/lib/canvas.test.ts`, `vitest run`. No mock needed
  (`extractDiscussionActivity` takes a plain object; it is already tested this way
  at `canvas.test.ts:27-56`). REUSE the existing `view` literal there (Bob's reply
  id 101 is nested under Alice's post, so Bob's reply `parentUserId === 1`,
  `names.get(1) === "Alice Adams"`) - EXTEND that describe block, do not create a
  second copy of the fixture.
- **Assertion:** `byUser.get(2).replies[0].parentName === "Alice Adams"` (the
  resolved display name, not the bare id `1`).
- **Direction of failure:** RED if `parentName` is `undefined`, the numeric id, or
  a different participant's name.
- **RED-by-construction:** yes. `DiscussionPost.parentName` does not exist on
  `HEAD`; the field reads `undefined`.
- **Sabotage S8 (resolve the wrong id):** set `parentName` from
  `names.get(entry.user_id)` (the reply author, Bob) instead of the parent (Alice).
  Then `parentName === "Bob Smith" !== "Alice Adams"`. RED. Restore, GREEN.
  **Discriminates: yes** - the fixture's author and parent are DIFFERENT people, so
  a self-vs-parent confusion is visible. (If a checker's fixture made author and
  parent the same person, S8 would NOT discriminate; the existing `view` fixture
  avoids that, which is why reusing it is specified.)

## 4. Satisfiability - reference construction (PROVES the RED tests are passable)

A set of RED tests is not a spec until something passes it. The following
reference sketch (design only, NOT to be committed) constructs an entry that
turns every oracle above GREEN. Each oracle is checked against it.

WAVE 1 (`discussions.ts`):
- `DiscussionPost` gains `parentName?: string`. In `extractDiscussionActivity`,
  when pushing a reply (`:69`), set `parentName: parentUserId !== null ? names.get(parentUserId) : undefined`.
  Passes REQ-8 (Bob's reply parent is Alice id 1, `names.get(1) === "Alice Adams"`).
- `CanvasStudentWork` gains `initialPostCount?: number`, `replyCount?: number`. In
  `fetchDiscussion` (`:147-154`), set them from `activity.initialPosts.length` and
  `activity.replies.length`. Passes REQ-4 (1 and 2, distinct).

WAVE 2 (`extraction.ts`), a discussion branch at the top of `canvasWorkToEntry`,
early-returning so the `work.text` block does not also run:
- `I = discussion.initialPosts.length`, `R = discussion.replies.length`.
- MANIFEST (section 1, front-loaded): a single line composed from `I` and `R`,
  e.g. `` `This submission is a discussion contribution: ${I} initial post${I===1?"":"s"} and ${R} repl${R===1?"y":"ies"} to classmates. A reply is engagement with a classmate, not a second initial post.` ``.
  Matches `/(\d+)\s+initial post/i` capture `String(I)` and
  `/(\d+)\s+repl(y|ies)/i` capture `String(R)`. Passes REQ-2 (a) and (b).
- INITIAL section: header `"=== INITIAL POST ==="`; if `I >= 1` the post text(s),
  else the line `"[This student did not write an initial post.]"` (matches REQ-5's
  marker regex). REPLIES section (only if `R >= 1`): header
  `"=== REPLIES TO CLASSMATES ==="` then per reply `"--- Reply to " + parentName + " ---"`
  (or `"--- Reply ---"`), then reply text. Sections joined with `"\n\n"`; manifest
  first. Passes REQ-3 (manifest is first, survives a 2000-char slice of a
  50000-char body; `truncateSubmission` returns `truncated: true`).
- `submittedFiles`: one per contribution. Initial:
  `{ name: "Initial post"` (or `"Initial post 2"` for extras)`, extension: "(none)", ... }`.
  Reply: `{ name: dotFree("Reply to " + parentName), extension: "(none)", ... }`
  where `dotFree(s) = s.replace(/\./g, "")` and names are made unique with a
  ` (2)` suffix on collision. Passes REQ-1 (distinct `"Initial post"` and
  `"Reply to ..."`, no `"Discussion post"`), REQ-6, and REQ-7 (the `dotFree` step
  makes `getBaseFileName(name).includes(".")` false, so the label is dropped from
  the model block even for FIX-G's `"Dr. Alan Turing"`).

Every oracle in section 3 is GREEN against this construction and RED against
`HEAD` (or against its named sabotage). The construction touches only the two
files the wave plan assigns, so the spec is satisfiable within the write set.

## 5. FINDING to route (attacked the architecture's own guarantee)

**F-1 (model-facing leak the architecture claims cannot happen).**
`a8-architecture.md` section 3.4 asserts the discussion labels are "DROPPED from
the model's file-list block ... this is DESIRED" and that the ONLY thing keeping
them out is `extension: "(none)"` plus dotless names. Measured against the real
filter: `buildSubmittedFileNamesBlock` (`prompts.ts:271-274`) drops a name only
when `getBaseFileName(file.name).includes(".")` is FALSE. It never looks at
`extension`. So a reply label whose `parentName` contains a period - "Dr. Smith",
"J. R. R. Tolkien", "Mary O. Brien" - produces a `name` that DOES contain a dot,
survives the filter, and is injected into the model's SUBMITTED FILES list as a
fake filename (`prompts.ts:280-282`), corrupting the filename-requirement feature
that block exists to serve. This passes `tsc` and every existing test; it is the
exact "mechanism that works on the happy path, hole on the edge" class this seat
exists to catch. REQ-7 fixture (b) encodes it as a hard oracle, and the section 4
`dotFree` step is the fix inside WAVE 2's write set (extraction.ts only; no
`prompts.ts` edit needed, keeping the architecture's file list intact). Routed to
the checker/orchestrator as a confirmation, not silently fixed: if the owner
prefers to leave labels dot-bearing, that is a `prompts.ts` change and a scope
change, and REQ-7 must be re-decided.

## 6. What is executable here vs what is argued

EXECUTABLE under `vitest run` in this checkout (network-blocked, no render):
- REQ-1, REQ-2, REQ-3, REQ-5, REQ-6 (structure half), REQ-7 - all in
  `src/lib/grade/extraction.test.ts`, driving `canvasWorkToEntry`,
  `truncateSubmission`, `buildSubmittedFileNamesBlock` (all real production
  functions).
- REQ-4, REQ-8 - in `src/lib/canvas.test.ts`; REQ-8 pure, REQ-4 with a
  `canvasGet` mock.

ARGUED, not asserted as verified (labelled as argued per this seat's mandate):
- AC-5 rendered rows/pixels (OV; residual R5). No render oracle exists.
- Route C / Route D correctness (owner-only, live calls; residuals R1/R2). No
  oracle here.
- The manifest's EFFECT ON THE MODEL'S OUTPUT (that the model actually stops
  presenting a reply as an initial post). The oracles verify the model RECEIVES
  the distinction, front-loaded and truncation-proof; they cannot verify the
  model's behaviour without a live Gemini call. This is the recognition/behaviour
  boundary the architecture draws (section 0) and is argued, not measured.

DECISIONS routed to the checker:
- D-1 (F-1): confirm the `dotFree` fix inside `extraction.ts` (REQ-7) vs a
  `prompts.ts`/scope change. Recommended: `dotFree`, keeps the write set intact.
- D-2 (REQ-6 uniqueness): mandate the reply-vs-reply name-collision oracle, or
  leave it recommended-only? AC-5 as written needs only initial-vs-reply.

## 7. Residual register (owner, instrument, step)

- **RT-1 - AC-5 rendered UI.** Owner: verify/UX pass at implementation time.
  Instrument: manual check or screenshot in the running app (no component renders
  under vitest). Step: after WAVE 2, before it ships. (= scope R5.)
- **RT-2 - model behavioural effect.** Owner: repo owner. Instrument: one live
  `gradeCanvasUrl` grade of a real graded discussion, reading whether the model
  still treats a reply as an initial post. Step: after WAVE 2 lands, owner-run
  (no live Gemini in this checkout).
- **RT-3 - Route C / Route D recognition.** Owner: repo owner. Instrument: a live
  Canvas/external call (scope R1/R2). Step: a future wave, not this round. No
  oracle here.
- **RT-4 - F-1 disposition.** Owner: checker/orchestrator (D-1). Instrument: REQ-7
  fixture (b), already designed. Step: this round's check, before WAVE 2 dispatch.
- **RT-5 - `initialPostCount`/`replyCount` are shape-only with no runtime reader.**
  Owner: whoever builds the reply-section rubric (scope R3/R4), when a reader might
  appear. Instrument: `grep -rn "initialPostCount\|replyCount" src` at that time.
  Step: the future scope. Recorded so the fields are not mistaken for wired.
- **RT-6 - reply-vs-reply name uniqueness (D-2).** Owner: WAVE 2 implementer if
  the checker mandates it. Instrument: the supplementary oracle in REQ-6. Step:
  WAVE 2. If the checker leaves it recommended-only, this is a KNOWN GAP, not a
  deletion: a duplicate `"Reply to X"` name collides a React key at render time
  (OV, invisible to vitest).

Deletions: none. Every AC in `docs/a8-scope.md` section 3 that is in this round's
recognition scope (AC-1..AC-5) has an executable oracle above; AC-6 is a scope
boundary (no test, by its own statement); AC-7/AC-8 are BLOCKED and out of scope.
