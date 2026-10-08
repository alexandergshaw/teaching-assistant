# A42 wave W1 test notes - the tokenizer/regex AGREEMENT pins

Status: TEST NOTES ONLY. No production code and no test code were written or
changed by this seat. Author: `loop-test-author` (Opus). This is the test-notes
activity for A42 W1; a fresh `loop-checker` gates these notes before the
implementer builds from them (`docs/DEV_LOOP.md`). Two rounds then ask
(AGENTS.md): this is ONE artifact carrying a recommended reading for the single
open fork (O3 keep/drop, section 7) and the alternative flagged.

Source of record: `docs/a42-census-scope.md` (SHIP-checked scope, read in full).
Every quantity below names the command that produced it; where I re-measured a
scope figure myself it is tagged MEASURED with the command. Where a figure
traces only to a session scratchpad the scope could not commit, it is tagged
RE-DERIVE (the implementer must compute it in committed code and STOP-and-report
on any disagreement - never edit the expected to match).

W1 is the guard-before-migration BEFORE-STATE for W2 (which converts the five
scanners to the tokenizer, `docs/a42-census-scope.md` section 8.2). W1 edits
test instrumentation ONLY; it must not touch grading, recording, or repo-grades
files (sibling waves GRADE-INFER-MERGE and WA-POST-RETRY-TAKE own those).

---

## 0. What W1 produces, in one paragraph

Three pins added to `src/tools/strip-comments-agreement.structure.test.ts` (the
probe): **O1** proves the production tokenizer equals the TypeScript-parser
ground truth on the files that matter (and, as recommended, over the whole
corpus); **O2** proves the five scanners' ACTUAL strip expressions lose a real
code marker that the tokenizer keeps, extracted from the files themselves so a
W2 conversion trips it; **O3** (count-free) freezes the `[^]`-spelled
block-comment-regex set to exactly the five scanners, so the W2 conversion (and
any new `[^]` copy) is caught without pinning the sibling-coupled whole-corpus
total. The five scanner files
are run UNCHANGED for baseline. All three pins are designed to be GREEN at HEAD
(the before-state) and to go RED exactly when the thing they guard breaks.

---

## 1. The measured facts W1 is built on (re-derive each; STOP-and-report on disagreement)

| # | Fact | Value | Command (run from repo root) | Tag |
|---|---|---|---|---|
| F1 | probe line count | 649 | `@(Get-Content src/tools/strip-comments-agreement.structure.test.ts).Count` (= `wc -l`, both 649) | MEASURED |
| F2 | size ceiling | 1000, strictly-greater fails (<=1000 passes) | `src/file-size-ceiling.structure.test.ts:41` (`const LIMIT = 1000`), counted by `countLines` (= `@(Get-Content).Count`, `src/lib/count-lines.ts:23-29`) | MEASURED |
| F3 | probe headroom | 351 lines | 1000 - 649 | MEASURED |
| F4 | the five `[^]`-spelled scanner files | exactly 5 (listed section 2) | `grep -rlF '[^]*?\*\/' src` | MEASURED |
| F5 | the `[^]`-spelled subset (the ONLY O3 number pinned) | exactly 5, the five scanners (section 2), stable | `grep -rlF '[^]*?\*\/' src` | MEASURED; stable because no sibling introduces a `[^]` block regex |
| F5b | whole block-comment-regex population (NOT pinned - moving target) | `[\s\S]`=98, `[^]`=5, total 103 at HEAD `ef6ceac2` (was 97/5/102 at the scope's HEAD `57c17e28`; WA-POST-RETRY-TAKE added `src/app/components/recording/useTakeAnnouncement.retry-take.test.ts`) | `grep -rlF '[\s\S]*?\*\/' src`, `grep -rlF '[^]*?\*\/' src`, union `sort -u` | MEASURED - recorded as context only; the total is a moving target while sibling waves land test files, so O3 does NOT pin it (section 6, residual R-1) |
| F6 | the 9 MIME trigger files | exactly 9 (listed section 3) | `grep -rlE 'accept="[^"]*(image\|video\|audio\|text\|application)/\*\|accept="\*/\*"' src --include=*.tsx --include=*.ts \| grep -v '\.test\.ts'` (grounds `docs/a42-scope.md:109-126`) | MEASURED |
| F7 | the 21 corruptible non-test files | 21 at the scope's HEAD (listed section 3) | `docs/a42-census-scope.md:208-221` (`census6.mjs`/`census10.mjs`); spot-checked present | RE-DERIVE AT BUILD HEAD (a sibling may add/remove one); STOP-on-disagreement, do not inherit the scope's list frozen |
| F8 | tokenizer == truth over the corpus | 2913 of 2913 equal; regex pipeline over-strips 532, both 2 | `docs/a42-census-scope.md:169-172` (`census2.mjs`) | RE-DERIVE |
| F9 | W1 baseline gate counts | draft 33, post 4, panel 16, promptAnnouncementDraft 26, types 3, probe 14 = 96 | `npm run test:paths` over the six files (section 8) | RE-DERIVE (re-run) |

The instruments W1 reuses, already imported by the probe (no new imports, no
cross-`*.test.ts` import): `typescript` as `ts` (`:4`), `fs`/`path` (`:2-3`), and
the production tokenizer `stripComments as productionTokenizer` from
`@/app/components/ui/modalAdoptionSourceScan` (`:5`). The tokenizer itself is
`modalAdoptionSourceScan.ts:155-229` (a character scanner, 405 lines, non-test
infrastructure so importing it is legal). The probe EXCLUDES ITSELF from its own
enumeration by path (`PROBE_FILE_REL`, `:504`, filtered at `:511`), so O1/O2/O3
code added inside the probe may use the literal `stripComments` freely without
perturbing the enumeration invariant at `:536`.

---

## 2. The five scanners and their ACTUAL strip expressions (O2's extraction targets)

All six expressions across the five files are the SAME two-stage pipeline (block
regex first, then CR-tolerant split + unanchored line strip). MEASURED by
opening each file:

| Id | File | Shape | Location | Free var |
|---|---|---|---|---|
| S1a-1 | `src/app/actions/prompt-announcement-draft.test.ts` | inline `const stripped = source.replace(/\/\*[^]*?\*\//g,"").split(/\r?\n/).map((l)=>l.replace(/\/\/.*$/,"")).join("\n")` | `:86-90` | `source` |
| S1a-2 | same file | inline, same chain, one line | `:136` | `source` |
| S2 | `src/app/actions/prompt-announcement-post.test.ts` | inline, same chain, one line | `:26` | `source` |
| S3a | `src/app/components/canvas-tab/announcements-panel.wiring.test.ts` | named `function stripComments(source)` single-chain `return source...` | `:26-32` | param `source` |
| S3b | same file | named `function stripCommentsForScan(source)` TWO-statement (`const noBlockComments = source.replace(...)` then `return noBlockComments.split(...)...`) | `:289-295` | param `source` |
| S4 | `src/app/components/canvas-tab/promptAnnouncementDraft.test.ts` | inline, same chain, one line | `:22` | `source` |
| S5 | `src/lib/prompt-announcement-types.test.ts` | named `function stripComments(source)` TWO-statement | `:13-19` | param `source` |

Total extractable strip expressions: **7** (2 + 1 + 2 + 1 + 1). RE-DERIVE this as
a computed count, not a literal (section 4).

Coverage gap this fills (why O2 is not redundant with the probe's existing A42
R1a at `:594-598`): the existing R1a enumerates only `ALL_DEFINED` copies, which
are files containing a function literally named `stripComments`. MEASURED
(`grep -c "stripComments"`): S1a, S2, S4 have ZERO `stripComments` mentions - the
three inline files are OUTSIDE the probe's enumeration domain entirely (scope
Finding R2-1). And S3b's `stripCommentsForScan` is a second helper the probe's
extractor never grabs (scope Finding R2-2, probe extractor at `:96` matches only
the name `stripComments`). So R1a today covers S3a and S5 but NOT S1a, S2, S4,
S3b. O2 covers all five files as a coherent set; the overlap on S3a/S5 is not a
tautology (it reads the real files, see section 4's refactor defense).

The five SOURCE targets the scanners read (O1's named set), line counts MEASURED
(`wc -l`):

- `src/app/actions/prompt-announcement-draft.ts` (135)
- `src/app/actions/prompt-announcement-post.ts` (32)
- `src/app/components/canvas-tab/announcements-panel.tsx` (533)
- `src/app/components/canvas-tab/promptAnnouncementDraft.ts` (79)
- `src/lib/prompt-announcement-types.ts` (59)

---

## 3. The frozen input sets O1 names (both fully enumerable from the tree)

**Membership re-derives at BUILD HEAD, not at the scope's HEAD.** The lists below
are snapshots at the scope's HEAD (`57c17e28`); the tree has moved since (now
`ef6ceac2`). Every exact-membership assertion (the 21 corruptible especially, but
also the 5 targets, 5 `[^]`, 9 triggers) MUST be computed by its construction
command at the HEAD the implementer builds on, and any disagreement with the
snapshot is STOP-and-report, never an edit-to-match. Do not inherit these as
frozen literals from `57c17e28`. (O1's corpus-wide `mismatches === []`, section 4,
does not depend on any of these lists; only the named-set exact-membership
assertions do.)

### The 9 MIME trigger files (F6, grounds `docs/a42-scope.md:116-126`)

1. `src/app/account/voice-style/page.tsx`
2. `src/app/components/caption-studio/VideoSource.tsx`
3. `src/app/components/course-planning/SyllabusMode.tsx`
4. `src/app/components/courses/AddCourseForm.tsx`
5. `src/app/components/courses/TextbookPhotoModal.tsx`
6. `src/app/components/recording/SourceDevicesPanel.tsx`
7. `src/app/components/recording/SpeedPanel.tsx`
8. `src/app/components/slide-studio/VideoModeSection.tsx`
9. `src/app/components/slide-studio/VoiceCloneSection.tsx`

CONSTRUCTION (not a hand list): re-derive by the F6 command (the regex above over
`*.tsx`/`*.ts`, then exclude paths containing `.test.ts`). Assert the re-derived
COUNT is 9 and the membership equals this frozen set; a 10th (or a 9th that
moved) is STOP-and-report, not an edit. Note: `AddCourseForm.tsx` is item 4 on
its REAL attribute `:375` (`image/*`); it ALSO carries a prose-comment opener at
`:137` whose regex deletion spans `:137-438` (302 lines, the tree's worst single
over-strip, scope section 3.2) - that is a D2 opener, and it is why AddCourseForm
is both a trigger and a corruptible file.

### The 21 corruptible non-test files (F7, `docs/a42-census-scope.md:208-221`)

D1 openers (string/attribute/template), 5:
`src/app/account/voice-style/page.tsx`, `src/app/components/content-tab/utils.ts`,
`src/app/components/courses/TextbookPhotoModal.tsx`,
`src/app/components/recording/SpeedPanel.tsx`,
`src/lib/github-test-workflow.ts`.

D2 openers (line comment), 16:
`src/app/actions/lms-generation.ts`, `src/app/actions/live-class.ts`,
`src/app/actions/grading-submission-grade.ts`,
`src/app/components/courses/AddCourseForm.tsx`, `src/app/page.tsx`,
`src/app/account/integrations/LmsCredentialSection.tsx`,
`src/app/components/TopBar.tsx`,
`src/app/components/grading-recording/grading-feedback-prompt.ts`,
`src/app/components/content-tab/modules/useLmsGeneration.ts`,
`src/app/actions/github-repos.ts`, `src/lib/course-intel/join.ts`,
`src/lib/google-oauth.ts`, `src/lib/grade/submission-kind.ts`,
`src/tools/backlog/glob-intersect.ts`,
`src/app/components/workflows/run-input/run-input-file-preview.ts`,
`src/app/components/workflows/WorkflowDescription.tsx`.

RE-DERIVE: build this set in committed code by a `census10.mjs`-style walk (a
non-test `.ts`/`.tsx` file where the block regex, run on RAW text, deletes at
least one non-comment, non-whitespace character). Assert the re-derived set
equals this frozen list; a disagreement is STOP-and-report. These 16 D2 files
include `src/lib/grade/submission-kind.ts` and a `grading-recording/` file -
O1 only READS them as inputs (never edits them), which does not collide with the
sibling grading/recording waves.

---

## 4. Pin O1 - the tokenizer equals the parser truth

**Object.** The production tokenizer `productionTokenizer(readFileSync(f))`
compared, per file `f`, to an independently computed ground truth.

**Instrument (the ground truth, O1's independent axis).** The TypeScript parser,
NOT a regex and NOT the tokenizer - this is the "axes from a different source
than the generator" rule. RE-DERIVE as committed code the `groundTruth(fileText)`
of `docs/a42-census-scope.md:90-98`: parse with `ts.createSourceFile`
(TypeScript present in `node_modules`, already imported), walk tokens via
`getChildren`, collect `ts.getLeadingCommentRanges` and
`getTrailingCommentRanges`, skip `JsxText`, skip JSDoc node interiors, AND read
the EndOfFile token's leading trivia explicitly, then remove exactly those
ranges from the text. The EndOfFile step is NOT optional: the scope's probe first
produced a FALSE tokenizer-disagreement on `src/lib/institution-fields.ts`
because a trailing JSDoc attached to the EndOfFile token was missed
(`docs/a42-census-scope.md:103-109`); build it in from the start, and if O1
reddens on a file whose only comment is at EOF, suspect the ground truth before
the tokenizer.

Normalise `\r` out of BOTH sides before comparing (the tokenizer copies `\r`
through; the range-removal keeps it too) - matches `census2.mjs`
(`docs/a42-census-scope.md:166`).

**Named set (frozen).** The union of: the 5 source targets (section 2), the 9
MIME triggers (section 3), the 21 corruptible files (section 3). Overlaps are
fine; dedup by path. For each, assert `strippedByTokenizer === groundTruth`,
and on failure the message NAMES the file and shows the first differing span.

**Corpus-wide assertion (RECOMMENDED, see the fork below).** Additionally walk
every `src/**/*.{ts,tsx}` and assert `mismatches === []` where a mismatch is any
file whose tokenizer output != ground truth. This SUBSUMES the 5+9+21 named set
and, crucially, the 9 triggers whose exact identity I ground from `a42-scope.md`
but the census scope never lists - the corpus assertion makes that identity
non-load-bearing. Scope measured ~8s for 2913 files; the probe already sets
`vi.setConfig({ testTimeout: 30_000 })` (`:32`). On failure, print the FULL list
of mismatching files AND label the likely cause: "a NEW tokenizer limit (e.g. a
regex literal after a bare `)`/`}`, section 6) is STOP-and-report, not an
expected edit."

**Non-vacuity guard (build it INTO O1).** Assert that for at least one named
input, `groundTruth(text) !== text` after CR-normalisation - i.e. the truth
actually removed a comment. Without this, a bug that made ground truth return its
input unchanged would make O1 compare the tokenizer to the raw file and pass
whenever the tokenizer also changed nothing. This is the "both sides identical"
tautology defense (`docs/loop/traps-tests.md`).

**Direction of failure.** RED if any tokenizer output differs from truth (the
tokenizer regressed, or a new unsupported construct appeared). The before-state
expectation is GREEN at HEAD (F8: 2913 of 2913 equal).

**Sabotage (named, with discrimination verdict).**
- S-O1-break (DISCRIMINATES): in a scratch copy of the tokenizer, force
  `regexAllowedHere` to always return `true` (or make block-comment mode never
  pop). Run O1. Expect RED on files containing a regex literal or a block
  comment, naming them. Restore -> GREEN. This proves O1 measures the tokenizer,
  not a constant.
- S-O1-vacuity (DISCRIMINATES on the instrument, not the tokenizer): make
  `groundTruth` a pass-through (`return fileText`). Expect the non-vacuity guard
  to go RED. Restore -> GREEN. This proves the truth side is real.
- S-O1-weak (DOES NOT discriminate, stated so it is not mistaken for coverage):
  deleting a `/*` real comment from one target file and re-running O1 leaves it
  GREEN (the tokenizer and truth agree on the now-comment-free file). The scope
  named this as a check; it is a NON-vacuity illustration, NOT a kill - it
  discriminates NOTHING about the tokenizer and must not be banked as a sabotage
  pass. Use S-O1-break and S-O1-vacuity for the real kills.

---

## 5. Pin O2 - the real expressions lose a marker the tokenizer keeps

This is the load-bearing before-state. It must evaluate the files' ACTUAL
expressions, not a retyped copy, so that a W2 conversion trips it (the
refactor-disarms-the-test trap, `docs/loop/traps-tests.md`: a retyped regex
would keep passing after W2 changed the files, which is exactly the failure mode
this pin exists to prevent).

**Object.** Each of the 7 strip expressions extracted FROM the five scanner files
(section 2), compared to the production tokenizer, on three defect fixtures.

**Instrument - extraction (two constructions, both deterministic; fail loudly).**
Generalise the probe's existing `extractStripComments` (`:78-113`) so it:
1. NAMED helpers: collects every function/arrow declaration whose name is in
   `{ "stripComments", "stripCommentsForScan" }` (not just the first, and not
   only `stripComments`). Wrap each via the probe's existing `toCallable`
   (`:117-129`, `new Function("return (" + text + ")")()`).
2. INLINE expressions: collects every `VariableDeclaration` named `stripped`
   whose initializer text contains BOTH a block-comment regex marker (`[^]` or
   `[\s\S]`, plus `\*\/`) AND the line-strip marker (`\/\/`), and whose
   initializer references the identifier `source`. Synthesise a callable
   `new Function("source", "return (" + initializerText + ");")`.
Transpile the file first (as `extractStripComments` already does, `:81-83`) so
type annotations do not defeat the parse; both constructions survive it (ES2019
keeps arrows/templates). The `stripped`-plus-marker filter prevents grabbing an
unrelated variable.

**Instrument - per-file count pin (ties the extraction to the real files).**
RE-DERIVE and freeze the per-file expected counts: draft 2, post 1, panel 2
(1 named `stripComments` + 1 named `stripCommentsForScan`), promptAnnouncementDraft
1, types 1; total 7. Assert the extractor finds exactly these. A file that cannot
yield its expected count is STOP-and-report. This is what makes O2 refactor-safe:
when W2 converts a file to the tokenizer import, its inline/named strip
expressions vanish, the count drops, and this pin goes RED until W2 updates it -
the intended W2 tripwire, same spirit as the probe's `:536` invariant.

**Instrument - the three defect fixtures (unique ASCII markers, no `\uXXXX`).**
Each fixture is a plain string in the probe; the marker is a distinctive token
present nowhere else.
- D1 (opener inside a string/attribute): `accept="image/*"` ... then
  `const keep = D1_SURVIVOR_TOKEN;` ... then a real `/* ... */` later. The lazy
  `[^]*?` closes at the real `*/`, deleting the marker; the tokenizer treats
  `image/*` as string content and keeps it. (Same shape as the probe's
  `FIXTURE_MIME_WILDCARD` `:267-274`; use a fresh marker so the assertion is
  self-contained.)
- D2 (opener inside a LINE comment - the case the row never named): a line
  `// scan dir/* here`, then `const keep = D2_SURVIVOR_TOKEN;`, then a line with a
  real `/* tail */`. Because the block stage runs BEFORE the line stage, the `/*`
  inside `dir/*` opens a block that eats forward to the real `*/`, deleting the
  marker; the tokenizer sees `dir/*` as line-comment text and keeps the marker.
  IMPORTANT (scope section 8.1): the glob must contain a BARE `/*`; `src/**/*.ts`
  self-closes (`/**/`) and does NOT defeat the pipeline - do not use it.
- D3 (`//` inside a URL string): one line
  `const u = "https://x.example"; const keep = D3_SURVIVOR_TOKEN;`. The unanchored
  `/\/\/.*$/` deletes from the `//` in `https://`, taking the marker; the
  tokenizer sees the `//` as string content and keeps it.

I HAND-TRACED all three through `modalAdoptionSourceScan.ts:155-229` and through
the pipeline; each discriminates (pipeline loses, tokenizer keeps). The
implementer MUST confirm by running at HEAD.

**Assertions.**
- Pipeline loses (RED the moment any copy becomes safe = W2): for each extracted
  expression `p` and each fixture `F` in {D1, D2, D3},
  `expect(p(F)).not.toContain(MARKER_F)`. This is the "documented finding, not a
  pass" idiom of the probe's `:594-598`.
- Tokenizer keeps (RED if the tokenizer regresses): for each `F`,
  `expect(productionTokenizer(F)).toContain(MARKER_F)`.

**Tokenizer-limit fixtures (documented findings, R-4; pin as KNOWN, deliberate).**
Two shapes the tokenizer UNDER-strips (opposite direction from the regex). Pin
them so a future reader knows they are deliberate limits, not W1 misses:
- LIMIT-APOS (JSX text apostrophe): a STRING fixture whose content is
  `const a = () => <p>Don't</p>; // APOS_COMMENT_MARKER`. The `'` in `Don't`
  enters string mode and never terminates, so the trailing comment SURVIVES:
  `expect(productionTokenizer(LIMIT_APOS)).toContain("APOS_COMMENT_MARKER")`.
  Write the fixture double-quoted or as a template literal so the apostrophe
  needs no escape. This is a JS string literal, NOT real JSX, so eslint
  `react/no-unescaped-entities` does not fire on it (that rule is JSX-only).
- LIMIT-REGEX-DIV (`/` after a bare `)`): fixture
  `if (x) /'/.test(y); // DIV_COMMENT_MARKER\nconst k = "a";`. `regexAllowedHere`
  resolves `/` after `)` to division (`modalAdoptionSourceScan.ts:104-109`), the
  `'` then opens a string, and the comment SURVIVES:
  `expect(productionTokenizer(LIMIT_REGEX_DIV)).toContain("DIV_COMMENT_MARKER")`.
  (Matches `census12.mjs`, `docs/a42-census-scope.md:388-398`.)

Direction for the limit pins: RED if the tokenizer's behaviour on these shapes
CHANGES (either way) - which forces a conscious doc update. The SAFETY of leaving
these limits unfixed is ARGUED, not executed here: APOS is guarded by the
pre-push eslint gate; REGEX-DIV is guarded by "0 such sites in the corpus today"
(the tokenizer header's grep claim + O1's corpus equality). W1 does not execute
either guard; it only freezes the limit itself.

**Sabotage (named, with discrimination verdict).**
- S-O2-convert (DISCRIMINATES; this is the W2 rehearsal): in a scratch copy of
  ONE scanner file, replace an inline/named strip with the tokenizer import.
  Expect the per-file count pin to go RED (count dropped) AND that file's
  "pipeline loses" assertion to go RED (the converted copy now keeps the marker).
  Restore -> GREEN. Proves O2 is tied to the real file, not a frozen regex.
- S-O2-tokenizer (DISCRIMINATES): in a scratch copy of the tokenizer, disable
  string mode (treat `"`/`'` as code). Expect the "tokenizer keeps" assertions on
  D1 and D3 to go RED. Restore -> GREEN.
- S-O2-marker-rename (DOES NOT discriminate; stated so): renaming a SURVIVOR
  marker in a fixture only breaks that fixture's own bookkeeping, not the
  property. Not a kill; do not bank it.

---

## 6. Pin O3 - freeze the `[^]`-spelled subset (COUNT-FREE)

O3 pins ONE thing: the `[^]`-spelled block-comment-regex files are exactly the
five scanners. It does NOT pin the whole-corpus total - that is a moving target
while sibling waves land test files (at HEAD `ef6ceac2` the total is already 103,
not the scope's 102, because WA-POST-RETRY-TAKE added a `[\s\S]` file), so a
`toBe(102)`/`toBe(97)` pin would be RED at HEAD and, by section 9's
GREEN-at-HEAD-first / STOP-on-disagreement rule, would force the implementer into
unscoped sibling-owned work to go green. The total census is relocated to
residual R-1. This is the same move already made for O1's corpus-wide
`mismatches === []` (an assertion, not a frozen count). O3 shrinks to ~30 lines.

**Object.** The set of `src/**/*.test.ts` files carrying a regex literal whose
body is the `[^]` block-comment spelling (`[^]*?\*\/`).

**Instrument.** Enumerate by AST (the `census1.mjs` method) or by reading each
test file's text and matching the `[^]` block-comment-regex spelling; either way
the matcher MUST exclude the probe itself by path (it contains these spellings in
its own fixtures). Do NOT use the `/s` dotAll flag anywhere (TS1501, fails tsc).

**Pin (frozen list + equality, the load-bearing W2 signal).** The `[^]`-spelled
set equals exactly the 5 files of section 2 (frozen list, assert set-equal AND
`length === 5`). This is NOT sibling-coupled: no sibling wave introduces a `[^]`
block regex (siblings use `[\s\S]`), so it is GREEN at HEAD and stays green until
W2 acts. When W2 converts the five, the set drops 5 -> 0 and the frozen list must
be updated in the same commit - the clean W2 tripwire, and the only O3 assertion
W2 actually needs. A NEW file arriving with a `[^]` spelling (e.g. one dodging the
probe's `stripComments`-keyed enumeration, scope Finding R2-1) makes the set
unequal -> RED until classified.

**Canary (instrument self-check).** A synthetic string containing a `[^]...*/`
regex MUST be matched by the enumerator; a synthetic regex WITHOUT `*/` MUST NOT.
This proves the enumerator discriminates a block opener from other regexes before
it is trusted against the tree.

**Direction of failure.** RED if the `[^]`-spelled set stops equalling the frozen
5 (W2 conversion, or a new `[^]` file). The whole-corpus swap-proof classification
is NOT attempted here (moving target); it is residual R-1.

**Sabotage (named).**
- S-O3-newfile (DISCRIMINATES): point the enumerator at a fixture directory
  containing a synthetic `*.test.ts` with a `[^]` block regex not in the frozen
  set; expect the set-equality assertion RED. Restore -> GREEN.
- S-O3-convert (DISCRIMINATES; W2 rehearsal): in a scratch copy of one scanner,
  swap its `[^]` for `[\s\S]` (or the tokenizer import); expect the set to drop to
  4 -> RED. Restore -> GREEN.
- S-O3-canary (DISCRIMINATES): feed the canary a block regex missing its `*/`;
  expect the "MUST NOT match" branch to fail if the matcher is too loose.

---

## 7. The one open fork: O3 keep/drop, decided against the measured line budget

**Measured budget.** Probe 649 (F1), ceiling 1000 strictly-greater (F2),
headroom 351 (F3). Line estimates for the pins as specified:

| Pin | Est. lines added |
|---|---|
| O1 (ground truth + named set + corpus-wide + non-vacuity) | ~120-130 |
| O2 (two extractors + count pins + 3 defect fixtures + 2 limit fixtures + assertions) | ~120-135 |
| O3 (count-free: `[^]` 5-file list + set-equality + canary) | ~30 |
| O3 FULL whole-corpus classification (RELOCATED to R-1, NOT in W1) | n/a |

O1 + O2 alone (~250) -> ~899, comfortably under 1000. O1 + O2 + O3 count-free
(~280) -> ~929, under with ~70 headroom.
`src/file-size-ceiling.structure.test.ts` is the gate that catches an overflow,
and it is in W1's gate set (section 8).

**RECOMMENDED reading: keep O3 in its COUNT-FREE form (section 6), in the probe.**
Rationale: O1 + O2 are the guard-before-migration before-state W2 actually
depends on (scope section 8.1: "O1+O2 alone are still the guard-before-migration
freeze"); O3's `[^]`=5 pin is the single O3 assertion W2 needs (the five drop
5 -> 0 when converted) and it is NOT sibling-coupled. The whole-corpus total-count
is deliberately NOT pinned (moving target; relocated to R-1), which both removes
the sibling-coupling blocker and shrinks O3 to ~30 lines - a pure budget win with
no loss of the W2 signal. The implementer MUST still measure actual additions with
`@(Get-Content src/tools/strip-comments-agreement.structure.test.ts).Count` after
writing, recording-split-style; if it exceeds 1000, drop O3's canary first, never
breach and never trim O1/O2 to make room.

**ALTERNATIVE (flagged, not recommended): take the whole-corpus swap-proof
classification NOW, in a new standalone file**
`src/tools/block-comment-regex-inventory.structure.test.ts`
(W1 write set becomes TWO files). Viable - I checked and found no `src/tools`
frozen-roots/basename canary that a new file there would trip (MEASURED: no
structure test pins a frozen root list over `src/tools`). Hard constraints if
taken: (a) the new file must contain ZERO occurrences of the literal
`stripComments` (else the probe's enumeration at `:509` lists it and demands a
probe edit, defeating the separation) - use "block-comment regex" vocabulary and
cite `file:line`, never the helper names; (b) it must exclude itself by path from
its own enumeration; (c) add it to the gate (section 8) and run the directory's
canary per the repo rule "gate must include directory canary". Cost: loses the
"ONE file" simplicity the scope chose, and the literal-avoidance is fragile (one
slip reddens the probe repo-wide). I recommend AGAINST it unless the owner
explicitly wants the swap-proof classification now.

This fork is settled here with a recommended reading acted on; it does not need a
round 2. If the checker disagrees on the budget, the lever is O3's form, not
O1/O2.

---

## 8. The gate

One path per argument, `npm run test:paths` (never a raw multi-path `vitest`/`npm
test`, which silently drops unmatched args - `docs/loop/traps-tests.md`). All
paths MEASURED present (section 1). Run from repo root:

```
npm run test:paths src/tools/strip-comments-agreement.structure.test.ts src/app/actions/prompt-announcement-draft.test.ts src/app/actions/prompt-announcement-post.test.ts src/app/components/canvas-tab/announcements-panel.wiring.test.ts src/app/components/canvas-tab/promptAnnouncementDraft.test.ts src/lib/prompt-announcement-types.test.ts src/file-size-ceiling.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
```

Every argument must be reported `COVERED`. Pass conditions:
1. The five scanner counts are UNCHANGED at 33/4/16/26/3 (F9) - W1 must not edit
   any scanner file; a changed count means it did.
2. The probe count RISES by the new pins (baseline was 14); O1/O2/O3 are all GREEN
   at HEAD (the before-state).
3. `src/file-size-ceiling.structure.test.ts` GREEN - the probe is <= 1000.
4. `src/lib/no-emojis.test.ts` and `src/source-bytes.structure.test.ts` GREEN -
   the new text is emoji-free and has no materialised `\uXXXX`/BOM/mojibake. Do
   NOT hand-roll an emoji or byte scan; these committed tests own that rule.
5. If the ALTERNATIVE (relocated O3 file) is taken, add that file as a further
   `npm run test:paths` argument and run the applicable directory canary.

`npx tsc --noEmit` must be clean (one caller; no `/s` flag anywhere). If any
`docs/` file is touched (it is - these notes), `npm run docs:gate` applies.

---

## 9. Satisfiability, and executable vs argued

**Satisfiability (the reference is the current tree).** Unlike a feature spec,
W1's pins are a BEFORE-STATE guard: they are satisfied by HEAD as it stands
(F8: tokenizer == truth on all 2913 files today; the regex pipelines over-strip
today). So the "prove the red tests are satisfiable" obligation is discharged by
confirming GREEN at HEAD: the implementer's FIRST action after writing each pin is
to run the gate and confirm green BEFORE any further change. A RED at HEAD means a
census figure or my hand-trace is wrong - STOP-and-report, do not edit the
expected to force green.

**Executable here (the implementer runs these):** O1's tokenizer-vs-truth
comparison (named set and corpus-wide); O1's non-vacuity guard; O2's extraction,
count pins, and the pipeline-loses / tokenizer-keeps assertions on D1/D2/D3;
O2's two tokenizer-limit observations; O3's count/membership/canary. All run under
node-env vitest over file bytes - no component renders, which is correct for
source-text/AST tests (`docs/loop/traps-tests.md`).

**ARGUED, not executed (do not report as verified):**
- The SAFETY of the tokenizer's two known limits (APOS guarded by eslint;
  REGEX-DIV guarded by "0 in corpus"). W1 freezes the limits; it does not run
  their guards.
- F8's exact counts (2913/532/2) and F7's 21-file membership until the
  implementer re-derives them in committed code.
- My hand-traces of D1/D2/D3 and the two limit fixtures through the tokenizer -
  argued until the implementer runs them at HEAD.
- The corpus-wide O1 assertion's robustness against concurrent sibling waves: a
  sibling introducing a regex-after-`)`/`}` would redden it. That is a REAL
  finding (a new tokenizer limit) and STOP-and-report, not a flake - but it is a
  cross-wave coupling the implementer should be ready for.

---

## 10. Residual register (owner, instrument, step - each has all three)

- **R-1. The whole block-comment-regex census (total count, `[\s\S]` population,
  per-file classification, and the one-in-one-out swap gap), plus the wider ~92
  regex-stripper files.** This is what O3 deliberately does NOT pin (it is a moving
  target: total 103 at HEAD `ef6ceac2` vs 102 at the scope's HEAD, because sibling
  waves keep landing `[\s\S]` test files). Owner: the pass that picks up A42 R2
  widening after W2 (the orchestrator decides if it is a row). Instrument: a
  whole-corpus classification in a deliberately-maintained standalone file (the
  section 7 alternative), computed at build HEAD rather than frozen. Step: an
  explicit O3/W3 chunk, or the next chunk editing any of them. Inherits
  `docs/a42-census-scope.md:585` R-1.
- **R-2. `docs/loop/this-repo.md:170` steers new copies out of the probe's
  enumeration.** Owner: the W2 implementer or orchestrator (shared doc). 
  Instrument: `grep -n "withoutLineComments" docs/loop/this-repo.md`. Step: the W2
  commit rewrites the advice to "import `stripComments` from
  `modalAdoptionSourceScan`". Inherits scope R-2.
- **R-4. Tokenizer limits (JSX apostrophe, `/` after `)`/`}`).** Owner: W1 test
  author (discharged by the two LIMIT fixtures in O2, section 5). Instrument:
  those frozen fixtures. Step: W1. Inherits scope R-4.
- **R-7. The S1c raw positive control (`prompt-announcement-draft.test.ts:142-145`)
  is comment-fakeable in principle.** Owner: W1/W2 test author. Instrument:
  `callLlm` count raw vs code (3 vs 2 today). Step: W2, when S1a converts.
  Inherits scope R-7.

Missing any of the three (owner/instrument/step) would make an entry a deletion
(`docs/loop/iteration-caps.md`); each above has all three.

---

## 11. Notes for adjacent waves (not W1's to act on)

- **S3 is UNBLOCKED for W2.** The scope flagged that W2 editing S3
  (`announcements-panel.wiring.test.ts`) collides with the ANNOUNCEMENTS-TAB
  A-W2/A-W3 regression gate (`docs/a42-census-scope.md:539-546`). Those waves are
  COMPLETE (shipped), so the collision is not live and S3 may convert in W2. W1
  does not touch S3's logic at all (O2 only READS it), so W1 is unaffected either
  way.
- **No overlap with the live sibling waves.** O1 READS
  `src/lib/grade/submission-kind.ts` and a `grading-recording/` file (both in the
  21 corruptible set) and the 9 triggers (two under `recording/`), but W1 edits
  none of them - it edits only the probe (+ optionally the relocated O3 file).
  GRADE-INFER-MERGE (`src/lib/grade/`) and WA-POST-RETRY-TAKE (`recording/`) own
  the writes there; W1's reads do not collide.
