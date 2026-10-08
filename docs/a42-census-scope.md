# A42 census scope: the comment-stripping machinery, and the five unverified scanners

Status: SCOPE + CENSUS ONLY. No production code and no test code were written
or changed. This is round 1 of 2 for this activity (`docs/loop/iteration-caps.md`);
a fresh `loop-checker` gates it before any wave is dispatched. Author: `loop-seat`
(Sonnet). Every quantity below names the command that produced it; where a
quantity could not be settled, section 9 says so rather than filling it in.

Backlog row: `docs/backlog.yml:727` (`id: 'A42'`, read in full: `sed -n 727,738p
docs/backlog.yml`). The row's own definition of what remains, quoted from
`docs/backlog.yml:737`: "STILL DEFERRED as follow-on: R2 (the full defect-spelling
census widening the enumeration beyond the 6) and residual-1 (the 3 inline
[^]-spelled scanners + 2 readdirSync scanners whose reach to a trigger file is
unverified)". The shipped part is `28fcc63f` (`git show --stat 28fcc63f`: 8 files).
The earlier scope for the shipped part is `docs/a42-scope.md` (539 lines, `wc -l`),
whose residual register this document consumes (section 10).

Tree: HEAD `57c17e28` at the final re-run (`git rev-parse --short HEAD`). The tree
MOVED during this work (HEAD advanced from `4f84f4dd` at start; two sibling waves
committed; the `src/` file count went 2911 -> 2912 -> 2913). The headline numbers
were re-run at the final HEAD and did not change except that file count
(section 2.3). Working-tree edits by siblings at the time (`git status --short`):
`docs/a29-*.md`, `docs/css-orphans.md` (modified); earlier in the session also
`src/lib/grade/prompts.ts` and
`src/app/components/walkthrough-announcement/announcement-draft-slots.ts`. None is
a file this document analyses as a scanner target, and none was touched.

---

## 0. The answer in one table

The five scanners are exactly the five files that spell the block-comment strip
with `[^]` instead of `[\s\S]` (AST census, section 2.2, spelling `[^]` -> 5 files;
the grep form `grep -rlF '[^]*?\*\/' src` returns the same 5). The row's "3 inline
+ 2 readdirSync" decomposition maps onto them as: the two that walk a directory
are `prompt-announcement-draft.test.ts` and `announcements-panel.wiring.test.ts`;
the three that read named files only are `prompt-announcement-post.test.ts`,
`promptAnnouncementDraft.test.ts` and `prompt-announcement-types.test.ts`
[ARGUED reading of the row's wording; it cannot change the set of five].

Verdict vocabulary, defined here because the row does not define it:

- VERIFIED-SOUND: on every input the scanner reads today its stripped output
  equals the parser-derived ground truth (measured), AND no comment/string can
  change its verdict in the FALSE-PASS direction by construction.
- DEFECTIVE-LATENT: a concrete input defeats it (a fixture that loses a real
  token, measured), but on its real inputs today the output equals ground truth,
  so no wrong verdict exists today. This is the A42 row's own "a trap, not yet a
  sprung one" state. DEFECTIVE-ACTIVE would mean a wrong verdict today; none exists.
- UNDETERMINED: needs a test to settle (none of the five ended here).

| # | Scanner (file:line) | Helper it uses | Real input vs AST truth | Reach to the 9 MIME trigger files | Verdict |
|---|---|---|---|---|---|
| S1a | `src/app/actions/prompt-announcement-draft.test.ts:86-90` and `:136` (inline) | `[^]` block regex then `\r?\n` split then `//.*$` | equal (target `prompt-announcement-draft.ts`) | none (one named file) | DEFECTIVE-LATENT, can false-pass (absence of `callLlm`/`@/lib/llm` at `:138-139`; export-line count at `:92`) |
| S1b | same file, walker `deriveCanvasForbiddenFiles` `:481-509` | NONE - tests RAW text with `/api\/v1/` (`:503`) | raw set 40 vs truth set 37 | YES, 9 of 9 (walks all non-test `.ts/.tsx` under `src`, 1676 files) | VERIFIED-SOUND on the hide axis (raw text is a superset of stripped text, so a comment cannot hide a real `api/v1`); comment-blind in the fail-CLOSED direction: 3 spurious members today |
| S2 | `src/app/actions/prompt-announcement-post.test.ts:26` (inline) | `[^]` pipeline | equal | none | DEFECTIVE-LATENT, can false-pass (a hidden second `export` passes the count at `:28`) |
| S3a | `src/app/components/canvas-tab/announcements-panel.wiring.test.ts:26-32` (`stripComments`) | `[^]` pipeline | equal (target `announcements-panel.tsx`) | none (one named file) | DEFECTIVE-LATENT, can false-pass (absence of `ta-canvas-ann-prompt` at `:219`) |
| S3b | same file, `stripCommentsForScan` `:289-295` called from walker `:297-325` (`:318`) | `[^]` pipeline | forbidden set 18 via pipeline = 18 via truth (27 raw) | YES, 9 of 9 | DEFECTIVE-LATENT, can false-pass (a real `getUserMedia` hidden by an over-strip drops a capture file from the forbidden set); NOT SPRUNG: the 9 triggers contain zero capture tokens raw, stripped or truth |
| S4 | `src/app/components/canvas-tab/promptAnnouncementDraft.test.ts:22` (inline) | `[^]` pipeline | equal | none | DEFECTIVE-LATENT, fail-CLOSED only: assertions are three `toContain` presence checks (`:23-25`), so an over-strip fails red, never green |
| S5 | `src/lib/prompt-announcement-types.test.ts:13-17` (`stripComments`) | `[^]` pipeline | equal | none | DEFECTIVE-LATENT, can false-pass (a hidden `export const` passes the type-only guard at `:41-44`) |

Reach evidence, two independent instruments agreeing: (a) reading the walkers
(`:481-509`, `:297-325`); (b) a runtime read trace over the whole suite (section 5):
S1 and S3 each read 1676 distinct `src` files including all 9 triggers; S2, S4, S5
each read exactly 1 `src` file.

Headline for the owner: **nothing is wrong today, all five are one string away
from wrong, and the real exposure is larger than the row's frame.** The row frames
the defect as the MIME wildcard (9 trigger files). Measured at HEAD, the block
regex also deletes real code whenever a LINE comment contains `/*` (a glob such as
`src/lib/live-class/**`), which the row never names; that spelling corrupts 21
non-test files (section 3.2), and the worst single deletion in the tree is
`src/app/components/courses/AddCourseForm.tsx:137-438` (302 lines), opened by a
prose comment, not by the real `accept="image/*"` at `:375`.

---

## 1. What the row actually asks for, and what was not asked

Two items: R2 (full defect-spelling census beyond the 6 converted scanners) and
residual-1 (the five). This document does both. It does NOT: fix anything; decide
the L9 polarity question (section 7.3); touch any announcement, walkthrough,
repo-grades or `src/lib/grade` file (read-only citations only); or claim anything
about the ~97 other regex-stripping files beyond what sections 2-5 measured.

---

## 2. The census instruments, and why they can be trusted

### 2.1 The ground truth is the TypeScript parser, not a regex and not the tokenizer

Every comparison below is against `groundTruth()` in the scratchpad probe
`lib.mjs` (path in section 11): parse each file with `ts.createSourceFile`
(TypeScript 5.9.3, `node -e "console.log(require('typescript').version)"`), walk
every token via `getChildren`, collect `ts.getLeadingCommentRanges` and
`getTrailingCommentRanges`, skip `JsxText` (so `<a>http://x</a>` is text, not a
comment), skip JSDoc node interiors, read the EndOfFile token's leading trivia
explicitly, remove exactly those ranges.

Instrument self-check, run first by `census2.mjs` and passing 4 of 4: a URL and a
`/*` inside strings beside a real trailing comment; a template literal containing
`/* not */`; a JSX apostrophe followed by a real comment; a MIME `accept="image/*"`
beside a `{/* jsx */}` comment. **The instrument also caught itself being wrong
once**: the first run reported the tokenizer disagreeing on
`src/lib/institution-fields.ts`, which was the ground truth missing a JSDoc comment
attached to the EndOfFile token (no node follows it). Fixed in `lib.mjs`, and
every number in this document was produced after the fix. (Numbers from the
intermediate `census3.mjs` and the first `census4.mjs` run are discarded; they
predate the fix and are not quoted.)

### 2.2 Spelling census (R2), by AST not by substring

Command: `node census1.mjs`. For every `*.ts`/`*.tsx` under `src` (2913 files at
HEAD `57c17e28`), find every regex literal whose body both opens and closes a
block comment (`\/\*` ... `\*\/`), every `new RegExp("...")` string with the same
shape, and every `indexOf`/`startsWith`/`split` call on the string `"/*"` or
`"*/"`.

| Quantity | Result | Note |
|---|---|---|
| block-comment regex sites | 125 | all are regex LITERALS; 0 are `new RegExp` strings |
| distinct files carrying one | **102** | the prior scope's grep floor was 95 (`docs/a42-scope.md` 1.1) |
| spelling `[\s\S]*?` | 97 files | |
| spelling `[^]*?` | 5 files | the five scanners |
| spelling `[\S\s]`, `[\w\W]`, `[\d\D]`, `(?:.\|\n)`, classic `[^*]*\*+` | 0 files | the AST tags these; none present |
| spelling OTHER | 1 file | `src/lib/supabase/courses.structure.test.ts:226`: `commentProse()` DELIBERATELY scans comment prose (the "assertions about comments" category of `docs/backlog.yml:305`); not a defect, left alone |
| files with a block regex that are NOT `*.test.ts` | **0** | |
| `indexOf`/`startsWith` block scanners | 2 files, 6 sites | `src/lib/use-server-exports.test.ts:68-78`, `src/lib/canvas-client-boundary.test.ts:91-101`: leading-directive skippers that stop at the first substantive line; not strippers, outside the defect family [READ, not executed] |
| line-comment regex sites (`//.*$` shapes) | 107 sites in 103 files | `census1.json` |

Name census, by `grep`-equivalent over declarations (`census7.mjs`):
`stripComments` 68 files, `withoutLineComments` 9, `withoutComments` 5,
`stripJsComments` 3, `stripCssComments` 3, `stripSourceComments` 2,
`withoutCssComments` 2, `stripSqlComments` 2, one each of `stripCommentsForScan`,
`stripCommentsTopLevel`, `stripAvatarHookComments`, `stripSingleLineComments`
(`src/lib/code-run-selection.ts`, the only non-test), `stripCommentsAndDollarQuotes`.

**Finding R2-1, the probe's blind spot and its cause.** The L13 probe
`src/tools/strip-comments-agreement.structure.test.ts` enumerates by the literal
text `stripComments` (`:507-511`). 83 test files mention it
(`census7.mjs`: 83; and `SAFE_FILES` 65 + `EXCLUSIONS` 18 = 83, parsed from the
file). **32 of the 102 block-regex files are outside that domain**, including
three of the five scanners (`prompt-announcement-draft.test.ts`,
`prompt-announcement-post.test.ts`, `promptAnnouncementDraft.test.ts`). The names
of all 32 are in `census7.mjs` output. The cause is a rule the loop itself wrote:
`docs/loop/this-repo.md:170` tells authors "A NEW test that names its helper with
that literal reddens the whole gate; name it `withoutLineComments` ... instead".
8 of the 9 `withoutLineComments` files carry the `[\s\S]` block regex anyway
(they are in the 32; opened: `src/app/components/grading-chat/GradingChatPanel.structure.test.ts:130-132`,
`src/app/components/repo-grades/repoGradesResultsPersist.structure.test.ts:9-15`),
so the advice steers new vulnerable copies OUT of the instrument built to count
them. Only `src/app/components/wb-remembered-fab-launch.wiring.test.ts:6-8` is
genuinely line-only (opened; absent from the block-regex list).

**Finding R2-2, one probe coverage gap inside an enumerated file.**
`announcements-panel.wiring.test.ts` is in `SAFE_FILES`, but the probe's extractor
matches only a function named exactly `stripComments` (`:96`). The file's second
helper `stripCommentsForScan` (`:289`), the one the walker uses, is never
extracted or classified.

### 2.3 Head-to-head over the whole corpus (the load-bearing measurement)

Command: `node census2.mjs` (re-run at HEAD `57c17e28`). Three strippers over all
2913 `src/**/*.{ts,tsx}` files, output compared to ground truth after removing CR
from both sides:

| Stripper | equal | over-strip (real code deleted) | under-strip (comment left) | both |
|---|---|---|---|---|
| production tokenizer `modalAdoptionSourceScan.ts:155` | **2913** | 0 | 0 | 0 |
| `[^]` block regex + CR-tolerant split + `//.*$` (the five) | 2379 | **532** | 0 | 2 |
| `[\s\S]` form (the 97) | 2379 | 532 | 0 | 2 |

`[^]` and `[\s\S]` are byte-identical in effect on every file, as expected.
The 2 "both" files are tooling tests that contain comment look-alikes inside
fixture strings (`src/tools/strip-comments-agreement.structure.test.ts`,
`src/tools/vitest-paths/gate-commands.structure.test.ts`). CRLF variant
(`census8.mjs`: every file forced to CRLF): ground truth LF-vs-CRLF
self-disagreement 0; tokenizer on CRLF != truth in 0 files; regex pipeline differs
in 534 for LF and 534 for CRLF. So CRLF is not a separate defect for the five or
for the tokenizer; the L13 CRLF modes are closed, as the probe says.

---

## 3. The defect spellings, quantified

The regex pipeline is two stages in a FIXED ORDER (block first, then per-line), so
there are three distinct defects, not one. Counts from `census5.mjs`/`census6.mjs`.

### 3.1 The three spellings

| Id | Defect | Mechanism | Corpus effect |
|---|---|---|---|
| D1 | block opener inside a STRING/TEMPLATE/JSX attribute | `accept="image/*"`, `'**/*.xml'`, a CSS template `/* ... */`: the lazy `[^]*?` closes at the next real `*/` | the row's defect. 55 deleting matches |
| D2 | block opener inside a LINE comment, `//` ... `glob/*` | the block stage runs BEFORE the line stage, so a `/*` inside `// ... copilot/* branches` opens a block that eats real code to the next `*/`. **Not named by the row.** | 20 deleting matches (`census6.mjs`), spans up to 302 lines (`AddCourseForm.tsx:137-438`) |
| D3 | `//` inside a string (URL) | the unanchored `//.*$` per-line strip deletes the rest of the line after `"https://..."` | line stage differs in 509 files (isolated); the dominant cause of the 532 |

Pipeline total: 534 of 2913 files differ from truth (532 over, 2 both).
Isolated-stage split (`census5.mjs` A): block stage alone differs in 35 files, line
stage alone in 509, both in 28, and **18 files differ only through the
interaction (D2)**: 35 + 509 - 28 + 18 = 534.

### 3.2 The corruptible target set is 21 non-test files, not the row's 9

"Corruptible target" = a file where the block regex, run on RAW text as every
pipeline runs it, deletes at least one non-comment, non-whitespace character
(`census6.mjs`, `census10.mjs`: 75 deleting matches in 54 files, 21 non-test):

- D1 openers (string/attribute/template): `src/app/account/voice-style/page.tsx:362-424`,
  `src/app/components/content-tab/utils.ts:31`, `src/app/components/courses/TextbookPhotoModal.tsx:358-391`,
  `src/app/components/recording/SpeedPanel.tsx:101-241`, `src/lib/github-test-workflow.ts:92-97`.
- D2 openers (line comment): `src/app/actions/lms-generation.ts:7-205` (199 lines),
  `src/app/actions/live-class.ts:25-141` (117), `src/app/actions/grading-submission-grade.ts:21-137`,
  `src/app/components/courses/AddCourseForm.tsx:137-438` (302 lines, the largest in
  the tree), `src/app/page.tsx:407-476`, `src/app/account/integrations/LmsCredentialSection.tsx:16-68`,
  `src/app/components/TopBar.tsx:29-54`, `src/app/components/grading-recording/grading-feedback-prompt.ts:4-48`,
  `src/app/components/content-tab/modules/useLmsGeneration.ts:210-261`,
  `src/app/actions/github-repos.ts:235-245`, `src/lib/course-intel/join.ts:28-65`,
  `src/lib/google-oauth.ts:3-19`, `src/lib/grade/submission-kind.ts:19-38`,
  `src/tools/backlog/glob-intersect.ts:7-34`,
  `src/app/components/workflows/run-input/run-input-file-preview.ts:7-18`,
  `src/app/components/workflows/WorkflowDescription.tsx:3-24`.

Correction to `docs/a42-scope.md`: its section 1.2 called `AddCourseForm.tsx:137`
"the same one false-positive prose comment" and dropped it. It is a D2 opener whose
deletion spans :137-438 and swallows the real `accept="image/*"` at `:375` and the
whole form body. The prior scope's "immune" verdicts were conditioned on the 9
D1 triggers and are not wrong for that frame, but the frame was too narrow.

The tokenizer handles D1, D2 and D3 (section 2.3: 0 of 2913 differ), so routing a
scanner through it closes all three at once.

---

## 4. The five scanners, one by one

Each entry gives: object, instrument, what a comment/string can do (direction),
and the evidence. "Truth" means the AST ground truth of section 2.1.

### 4.1 S2 `prompt-announcement-post.test.ts` (smallest; the template for S1a/S4)

`:25-28` reads `src/app/actions/prompt-announcement-post.ts`, strips with
`source.replace(/\/\*[^]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n")`
(`:26`), keeps lines with `/^export\b/`, expects exactly 1 and that it matches
`/^export async function postPromptAnnouncementAction/`.

- Strips `//`: yes, unanchored, CR-tolerant split. Strips `/* */`: yes. CRLF: safe
  (section 2.3).
- Real input: `prompt-announcement-post.ts` has zero `/*` occurrences and the
  pipeline output equals truth (`census8.mjs`: 1 export line pipeline, 1 truth,
  equal true). Not sprung.
- Defeat, measured (`census6.mjs`): `const u = "https://example.com"; export const hidden
  = callLlm();` on one line, the pipeline deletes `export const hidden`, so a second
  export is invisible and the count still reads 1. FALSE-PASS. The tokenizer keeps
  it. Same result for `accept="image/*"` followed later by a real `*/` (D1).

### 4.2 S1a `prompt-announcement-draft.test.ts:84-97` and `:133-146`

Same pipeline at `:86-90` and `:136` over `prompt-announcement-draft.ts` (one `/*`
at `:43`, pipeline == truth). Two polarities live here:
- `:92` export-line count == 1 and `:94` shape: over-strip hides a second export,
  FALSE-PASS.
- `:137-139` `toContain("routePromptAnnouncement")`, `not.toContain("@/lib/llm")`,
  `not.toContain("callLlm")`: the presence check fails closed; the two ABSENCE
  checks FALSE-PASS if a string-opened over-strip deletes a real
  `import ... "@/lib/llm"` or a real `callLlm(` on the same line as a URL.
- `:142-145` raw positive control `toContain("callLlm")` over
  `prompt-announcement-model-call.ts` is not a strip scanner. A comment could
  satisfy it, but `callLlm` occurs 3 times raw and 2 in code today (`census8.mjs`),
  so it is not faked now. Observation only.
- Environment note: this test file is `w/mixed` line endings in the working tree
  and `i/lf` in the index (`git ls-files --eol`): 597 CR bytes in 609 lines
  (`tr -cd '\r' < file | wc -c`, `wc -l`). The pipeline is CR-tolerant, so this does not matter
  here, but it is the line-endings trap in the flesh.

### 4.3 S1b the walker `deriveCanvasForbiddenFiles` (`:481-509`), the `readdirSync` scanner

`readdirSync` (`:486`), recursive over `SRC = join(process.cwd(), "src")` (`:438`),
all `.ts/.tsx` without `.test.` (`:501`), `if (/api\/v1/.test(text)) out.add(full)`
(`:503`) on RAW `readOrEmpty` text. **It never strips.** So it cannot be defeated by
a stripper bug, and a comment cannot hide a real `api/v1`: raw text is a superset
of any stripped text. What a comment CAN do is add a spurious member (fail
closed): measured raw 40, truth 37; the 3 spurious are `src/lib/canvas-fetch.ts`,
`src/lib/canvas-remote-url.ts`, `src/lib/lms-credential-probe-outcome.ts`
(`census5.mjs` D). The assertions that consume the set pass today (zero violations
rooted at the draft action, `:596-599`; non-empty and `>= 30`, `:583-586`; the
positive control at `:588-594` is non-vacuous), so the spurious members are
unreachable from the root today. This is consistent with the `docs/backlog.yml:305`
(L9) starting rule: an ABSENCE-type scan should NOT strip comments.
Reach: 9 of 9 trigger files are inside the walk (`census7.mjs`: "triggers inside
S1/S3 walker set: 9 of 9") and the runtime trace read all 9. Verdict
VERIFIED-SOUND on the hide axis, with the fail-closed over-inclusion recorded.

### 4.4 S3a/S3b `announcements-panel.wiring.test.ts`

- S3a `stripComments` `:26-32`, used at `:35`, `:53`, `:211` over `announcements-panel.tsx`
  (zero `/*` occurrences; pipeline == truth). Presence checks (`:38-58`, `:214-215`)
  fail closed; the absence check `:219` (`not.toContain("ta-canvas-ann-prompt")`)
  can FALSE-PASS. The two AST-based blocks (`:75-80`, `:152-156`) parse raw source
  with the TypeScript compiler and are comment-immune; not in the family.
- S3b `stripCommentsForScan` `:289-295`, walker `:297-325`: strips every non-test
  `.ts/.tsx` under `src` with the `[^]` pipeline (`:318`) then tests
  `/getUserMedia|getDisplayMedia|new MediaRecorder/` (`:319`). A string-opened
  over-strip deleting a real capture call drops a file from the forbidden set, so
  `(iii)` `:406-409` could pass while a capture capability is reachable: the
  worst false-pass in the five, because it is a CAPABILITY wall.
  Replayed over the real tree (`census5.mjs` C): forbidden set 18 via pipeline,
  18 via truth, 27 via raw; hidden = [] ; spurious = []; the 9 comment-only mentions
  are exactly why the strip is load-bearing here. The 9 trigger files contain no
  capture token raw, stripped or truth (`census5.mjs` B). NOT SPRUNG, and only
  because none of the 21 corruptible files hides a capture call today.
  The probe does not see this helper (R2-2).

### 4.5 S4 `promptAnnouncementDraft.test.ts:18-25`

Pipeline at `:22` over `promptAnnouncementDraft.ts` (3 `/*` occurrences at lines
25, 38, 55, all real; pipeline == truth). Three `toContain` presence checks only.
An over-strip makes it fail red; a false-pass needs UNDER-strip, which the pipeline
produced in 2 of 2913 files (both tooling fixtures) and in none of the five targets.
DEFECTIVE-LATENT, fail-closed. Lowest priority to convert; cheapest, and converts
with the others for uniformity.

### 4.6 S5 `prompt-announcement-types.test.ts:13-17`, `:22-45`

`stripComments` (`:13-17`) over `prompt-announcement-types.ts` (1 `/*` at `:26`, real;
equal). It exists to keep a file TYPE-ONLY: `:25-31` every export line is type or
interface; `:33-39` every import is `import type`; `:41-44` the stripped body
contains none of `export const`, `export function`, `export class`, `export
default`, `export enum`, `require(`. All three FALSE-PASS if a real `export const`
is hidden by D1/D2/D3. Measured defeat is the S2 fixture with the hidden token
`export const`. DEFECTIVE-LATENT.

---

## 5. Reach, measured at runtime and by reading

**Instrument.** A scratchpad-only vitest config (`vitest.trace.config.mjs`) that
adds one setup file (`trace-setup.mjs`) patching `fs.readFileSync` to append
`{test file, src file}` to an OS-temp log, then ran the WHOLE suite with no path
arguments. Result: `Test Files 1237 passed (1237)`, `Tests 24695 passed (24695)`,
90.15s, 126114 trace lines, 238 test files that read any `src` file. This is a
tracing run with a modified config, NOT the repo's `npm test` gate; it proves the
shim did not break any test and gives the reads. It traces `readFileSync` only
(not `readFile`/`createReadStream`/`ts.sys.readFile`), so absence of a read is
weaker evidence than presence.

READ reach is not STRIP reach. 17 regex-stripper test files read at least one of
the 21 non-test corruptible files (`census10.mjs`). Which of them strip whole
files with the vulnerable regex, resolved by opening each:

| Reader | Reads corruptible files | Does it strip them with the vulnerable regex? |
|---|---|---|
| `announcements-panel.wiring.test.ts` (S3b) | 21 | yes, whole file; outcome equals truth (4.4) |
| `prompt-announcement-draft.test.ts` (S1b) | 21 | no, raw (4.3) |
| `action-guard-coverage-github-cohort.test.ts`, `guard-overtightening.test.ts` | 19, 16 | per EXPORT BODY slice only (`action-guard-coverage-github-cohort.test.ts:127-141`, strip at `:712`). Decision replay (`census11.mjs`): 103 use-server modules, 504 exported action bodies, `[\s\S]` pipeline output differs from tokenizer on 10 bodies, **0 change the set of `require*()` guards called**. Not sprung. |
| `repoGradesResultsPersist.structure.test.ts` | 21 | no; walker uses raw `.includes("ta-repo-grades-cells")` (`:72-73`) |
| `topLevelTabs.wiring.test.ts`, `gradingResultsHelpersWiring.test.ts` | 8, 4 | directory listings and named reads (`:623`, `:237`), not whole-tree strips [READ] |
| `page-module-css-classes.test.ts`, `page-module-css-orphan-classes.test.ts`, `buttonVariant.test.ts`, `walkthrough-announcement.structure.test.ts` | | already on the tokenizer (`28fcc63f`) for source; their remaining block regexes are CSS-text strips (residual 4 of `docs/a42-scope.md`) |

Conclusion for residual-1: the "reach to a trigger file" question is SETTLED for
the five: S1b and S3b reach all 9; S1a, S2, S3a, S4, S5 reach none. The wider
question the settled answer exposes (21 corruptible files, not 9) was traced for
every reader that touches them; none produced a wrong verdict today.

---

## 6. The helper the fix routes through, and its limits

`stripComments` at `src/app/components/ui/modalAdoptionSourceScan.ts:155-229` is a
character-scanning tokenizer (modes `code`, `line-comment`, `block-comment`,
`string-single`, `string-double`, `template`, plus regex-literal skipping via
`regexAllowedHere` `:110-123`). It is non-test infrastructure, so the "no import of
another `*.test.ts`" rule does not apply (`docs/backlog.yml:305`). It is 405 lines
(`wc -l`), well under the 1000 ceiling (`src/file-size-ceiling.structure.test.ts:41`).

Measured sound on the whole corpus (2913 of 2913, section 2.3, LF and CRLF). Its
documented limits, characterised by fixture (`census6.mjs`), so W1 can pin them:

- **JSX text apostrophe.** `<p>Don't</p>` enters string mode and does not
  terminate at a newline, so a real comment after it survives (under-strip).
  Demonstrated: `// export const commented = 1;` survived the tokenizer and not the
  truth. **Guarded by lint, measured**: `npx eslint --stdin --stdin-filename
  src/app/zz-a42-probe.tsx` on `export const A = () => <p>Don't stop</p>;` printed
  `1:30  error  ... react/no-unescaped-entities` and exited 1 (rule is error severity
  in the recommended set spread by `eslint-config-next`,
  `node_modules/eslint-plugin-react/index.js:63`, not overridden in
  `eslint.config.mjs:1-18`). The pre-push gate runs lint. A reading-plus-one-run
  claim, not a rendered one.
- **`/` after `)` or `}`** resolves to division (documented at `:104-109`).
  Demonstrated with a real stress case (`census12.mjs`): `if (x) /'/.test(y);`
  followed by `// real comment TOKEN_COMMENT` and `const k = 'a';` - the tokenizer
  reads `/` as division, the `'` inside the regex opens a string, and the real
  comment SURVIVES (tokenizer != truth); the same with a regex after a bare `}`;
  division after `)` (`(b + c) / 2`) stays correct. Direction: UNDER-strip, so a
  presence scanner can be satisfied by commented-out code, the opposite of the
  regex pipeline's direction. The tokenizer header says no regex literal in
  `src/app` follows a bare `)`/`}` today, and the corpus equality of section 2.3
  (0 of 2913 differ) agrees. A (weaker) earlier probe with no quote inside the
  regex passed and did not exercise this; it is not cited as evidence.
- It copies `\r` through (the regex pipelines normalise it); the comparison in this
  document removes CR from both sides.

---

## 7. Fix shape, and one genuine fork

### 7.1 Per DEFECTIVE scanner

Route through `import { stripComments } from "@/app/components/ui/modalAdoptionSourceScan"`
and delete the local helper or inline expression. This is exactly what `28fcc63f`
did for the six, including its probe bookkeeping (section 8.2). A frozen
characterization should pin each (section 8.1). Do not fix S1b: it is sound on the
hide axis and any strip would weaken it under the L9 rule.

### 7.2 What converting changes in each file (the guard-before-migration check)

On each scanner's real input the tokenizer output equals the pipeline output
(both equal truth), so the conversion changes NO stripping decision on today's
inputs. That is the frozen-oracle fact W1 must capture BEFORE W2: it is what makes
the conversion safe, and it is checkable per input.

### 7.3 The fork: absence assertions over stripped text (RECOMMENDED READING STATED)

`docs/backlog.yml:305` (L9) states a starting rule: a PRESENCE assertion must strip
comments; an ABSENCE assertion must NOT (a commented-out forbidden call is still
worth failing on). Three of the five contain ABSENCE assertions over STRIPPED text
(S1a `:138-139`, S3a `:219`, S5 `:41-44`). Two readings:

1. (RECOMMENDED, and what this scope assumes) A42 keeps polarity as authored and
   only makes the strip correct. Polarity is L9's triage, per assertion, owned by
   L9's next scope; changing it here would couple two items the L9 note says are
   "adjacent-but-in-tension". Cost if wrong: W2 converts a strip whose polarity L9
   later flips; the conversion is not wasted (the tokenizer is the strip L9 would
   use for the presence half).
2. A42 also flips these three to raw. Cost: a doc comment that names `callLlm`
   in prose would then fail the S1a absence check, forcing prose rewrites outside
   A42's write set.

---

## 8. Wave plan (recommendation; the orchestrator owns the dispatch)

Per `guard-before-migration`: freeze the RESOLVED behaviour, prove it can fail,
then convert. Two waves for the five; the wider population is a residual, not W3.

### 8.1 W1 - characterize (test-only; ONE file edited)

Write set: `src/tools/strip-comments-agreement.structure.test.ts` only (649 lines,
`wc -l`; room for roughly 350 before the 1000 ceiling). Reason it is the right
home: a NEW `*.test.ts` that mentions `stripComments` reddens the probe's own
enumeration (`:520`) unless added to `EXCLUSIONS`, so a separate file forces a probe
edit anyway; extending the probe is the lower-trip route and is what A42 R1 did.

Pins, each with object, instrument, direction of failure:

- **O1, tokenizer equals truth on the inputs that matter.** Object: the tokenizer
  output vs AST truth over a frozen input set: the 5 named targets, the 9 triggers,
  the 21 corruptible files. Instrument: `ts.createSourceFile` +
  `getLeadingCommentRanges` (the probe already imports `ts`, `:4`). Failure: RED if
  any output differs, naming the file. Fork for the test seat: corpus-wide equality
  (2913 files, ~8s measured) is stronger and makes a tokenizer regression reopen
  nothing silently, but any sibling that adds an unsupported construct goes red; the
  recommended default is the frozen small set plus ONE corpus-wide assertion
  `mismatches == []`, because the helper W2 depends on is the thing being guarded.
- **O2, worst-case exposure, frozen as a documented finding.** Object: the `[^]`
  pipeline, evaluated from the five files' ACTUAL expressions, not a retyped copy
  (a retyped copy would disarm the oracle, `docs/loop/traps-tests.md` "refactor
  disarms the test"), vs the tokenizer, on fixtures D1, D2, D3 (`census6.mjs`
  fixtures W-a and W-b; `census8.mjs` W-c-fixed: `// walks dir/* for the check`
  then `export const hidden = callLlm();` then `/** header */`; note the first W-c
  in `census6.mjs` used `src/**/*.ts`, whose `/**/` closes itself and so did NOT
  defeat the pipeline - a glob must contain a bare `/*` to be a D2 opener).
  Plus the two tokenizer-limit fixtures of section 6 (`census12.mjs`), pinned as
  documented findings. Instrument: marker-token survival.
  Failure: the pipeline assertion is "marker LOST" (RED the moment a copy becomes
  safe, the `A42 R1a` idiom at `:594-598`); the tokenizer assertion is "marker KEPT"
  (RED if the helper regresses).
- **O3, close the 32-file blind spot by construction.** Object: every regex literal
  in `src/**/*.test.ts` whose body opens and closes a block comment, enumerated by
  AST (the `census1.mjs` method) vs a frozen classification of each file as
  string-unaware strip / tokenizer-routed / deliberate comment-prose scan
  (`courses.structure.test.ts:226`) / CSS text. Canary: a synthetic text containing
  a `[^]` regex and a `[\S\s]` regex MUST be found; a synthetic regex without
  `\*\/` MUST NOT. Failure: RED if a new file appears with an unclassified block
  regex, so a copy that dodges the `stripComments` literal (the
  `this-repo.md:170` advice) is caught. Cost to siblings: a wave that adds a new
  block-regex file goes red until classified, the same trade L13 made. If the
  owner wants W1 cheaper, O3 is the droppable pin; O1+O2 alone are still the
  guard-before-migration freeze.

Sabotage (test seat designs; named here so W1 is not accepted without it): make a
frozen copy string-aware and watch the O2 pipeline assertion go RED; delete one
target's `/*` real comment and watch O1 stay green (proving O1 is not trivially
true); point O3 at a fixture with a renamed helper and watch it go RED.

Gate for W1 (wrapper form, per `docs/loop/this-repo.md` "Running a named set of
test files"): `npm run test:paths src/tools/strip-comments-agreement.structure.test.ts
src/app/actions/prompt-announcement-draft.test.ts
src/app/actions/prompt-announcement-post.test.ts
src/app/components/canvas-tab/announcements-panel.wiring.test.ts
src/app/components/canvas-tab/promptAnnouncementDraft.test.ts
src/lib/prompt-announcement-types.test.ts`, every argument `COVERED`. Baseline
measured now (`npm run test:paths` over exactly those six):
`COVERED ...prompt-announcement-draft.test.ts files=1 passed=33`,
`...prompt-announcement-post.test.ts files=1 passed=4`,
`...announcements-panel.wiring.test.ts files=1 passed=16`,
`...promptAnnouncementDraft.test.ts files=1 passed=26`,
`...prompt-announcement-types.test.ts files=1 passed=3`,
`...strip-comments-agreement.structure.test.ts files=1 passed=14`;
`Test Files 6 passed (6)`, `Tests 96 passed (96)`. Pass condition: the probe's
count rises by the new pins and the five counts stay 33/4/16/26/3. Also run
`npm run docs:gate` if any `docs/` file is touched.

### 8.2 W2 - convert the five (after W1 is green and checked)

Write set (6 files): `prompt-announcement-draft.test.ts` (the three inline strips
at `:86-90`, `:136`; leave the walker `:481-509`), `prompt-announcement-post.test.ts`
(`:26`), `announcements-panel.wiring.test.ts` (delete both local helpers
`:26-32`, `:289-295`, import the tokenizer), `promptAnnouncementDraft.test.ts`
(`:22`), `prompt-announcement-types.test.ts` (`:13-17`), and the probe's
bookkeeping.

Probe bookkeeping, [ARGUED, arithmetic not executed]: today `SAFE_FILES` 65 +
`EXCLUSIONS` 18 = 83 = mentioning files. After W2 the three inline files newly
mention `stripComments` (+3, so 86 mentioning); `announcements-panel.wiring` and
`prompt-announcement-types` still mention it via the import, so they MOVE from
`SAFE_FILES` to `EXCLUSIONS`; the three new ones are added to `EXCLUSIONS`: `SAFE_FILES`
63 + `EXCLUSIONS` 23 = 86, which satisfies the invariant at `:536`. If any of these
is left in `SAFE_FILES`, `:594-598` (no copy is MIME-safe) goes RED because the file
is no longer a copy; that is the intended tripwire, not a regression.

Pass conditions: (1) the six-argument `npm run test:paths` form above, all COVERED,
counts 33/4/16/26/3 unchanged for the five and the probe at its W1 count; (2) `git
status --short` equals exactly the six files (plus nothing under
`.claude/worktrees`); (3) `npx tsc --noEmit` exit 0 with no output (one caller);
(4) the W1 O1/O2 pins unchanged and green; (5) sizes via `@(Get-Content <f>).Count`
under 1000. Direction of failure for (1): any count change means a stripping
decision changed.

Disjointness, to be computed at dispatch (`docs/loop/parallel-disjointness.md`), not
asserted here: `docs/announcements-tab-a-w2-move-test-notes.md:517-535` lists
`announcements-panel.wiring.test.ts` as "NEEDS NO EDIT - run it for REGRESSION
SAFETY only" in the sibling announcements-tab A-W2 gate, and that wave MOVES
`announcements-panel.tsx` (`:38`). W2 editing S3 intersects that file set and that
wave's regression gate; sequence S3 after it lands, or hold S3 out of W2. The
other four files, and the probe, do not appear in that notes file (`grep -n` over
it: only `announcements-panel` hits). No overlap with `src/lib/grade/`.

---

## 9. What I could not determine

- Whether the ~92 regex-stripper files OTHER than the five and the 17 readers of
  section 5 produce a wrong verdict today. Read reach and decision replay were done
  for every reader of the 21 corruptible files and for the guard walkers; a
  scanner that reads a corruptible file through a route the trace does not see
  (`readFile`, a stream, `ts.sys`) is not ruled out.
- Whether the tokenizer is right on syntax not yet written (section 6, regex after
  `)`/`}`). Pinned by corpus equality, not proven.
- Whether `npm test` as the repo runs it is green at HEAD: the tracing run of the
  whole suite was green (1237 files, 24695 tests) but with a modified config.
- Any claim about rendered markup: none is made; no component is rendered by any
  test (`docs/loop/this-repo.md` section 2). Everything above is source text.
- The CSS and SQL stripper families (`stripCssComments`, `withoutCssComments`,
  `stripSqlComments`, the CSS-text strips in `page-module-css-*.test.ts`): counted,
  not analysed.

---

## 10. Disposition of the prior scope's residuals (`docs/a42-scope.md` register)

| Prior item | Disposition |
|---|---|
| 1. two `readdirSync` scanners not traced | HANDED NOWHERE - CLOSED here: section 4.3 (S1b) and 4.4 (S3b), both traced to a root and an outcome |
| 2. 95-file floor is not a ceiling; use an AST enumeration | KEPT as W1 pin O3; the measured number is 102 files (125 sites), section 2.2 |
| 3. 70-name vs 95-substring reconciliation | KEPT as O3; reconciled by AST: 83 name-mentioning vs 102 regex-carrying, 32 outside the probe domain, section 2.2 |
| 4. CSS-text comment stripping | KEPT as a residual, R-3 below; still out of scope |
| 5. no fix executed | KEPT: still scope-only; the fix is W2 |

## 11. Residual register

Each entry has an owner, an instrument, and the step that will measure it. The
orchestrator files these as backlog rows at disposal (`docs/DEV_LOOP.md` "Record
disposals"); none is filed by this seat.

- **R-1. The other ~92 regex-stripper files.** Owner: whichever pass picks up A42
  R2 widening after W2 (unfiled; the orchestrator decides if it is a row). Instrument:
  O3's enumeration plus `census10.mjs`-style read map. Step: the next chunk that edits
  any of them, or an explicit W3.
- **R-2. `docs/loop/this-repo.md:170` steers new copies out of the probe.** Owner: the
  W2 implementer or the orchestrator (a shared doc, so a disjointness check against
  other `docs/loop` editors first). Instrument: `grep -n "withoutLineComments"
  docs/loop/this-repo.md`. Step: the W2 commit rewrites the line to "import
  `stripComments` from `modalAdoptionSourceScan`".
- **R-3. CSS-text strippers** (`page-module-css-classes.test.ts:129,365`,
  `page-module-css-orphan-classes.test.ts:87,112,334`,
  `walkthrough-announcement.structure.test.ts:768`). Owner: none in A42. Instrument: a
  census of `content:\s*"[^"]*/\*` over `*.module.css`. Step: only if the owner files it.
- **R-4. Tokenizer limits (JSX apostrophe, `/` after `)`/`}`).** Owner: the W1 test
  author. Instrument: fixtures of `census6.mjs` frozen as documented findings. Step: W1.
- **R-5. L9 polarity fork (section 7.3).** Owner: L9's next scope pass. Instrument:
  per-assertion classification. Step: the L9 item, not A42.
- **R-6. W2 disjointness against the announcements-tab A-W2 wave.** Owner: the
  orchestrator. Instrument: exact-path intersection (`sort | uniq -d`, pasted) against
  `docs/announcements-tab-a-w2-move-test-notes.md`'s file set. Step: before W2 dispatch.
- **R-7. The S1c raw positive control (`:142-145`) is comment-fakeable in
  principle.** Owner: the W1 test author, which may tighten it with the strip-aware
  helper when S1a converts. Instrument: `callLlm` count raw vs code (3 vs 2 today).
  Step: W2.

## 12. Commands, so a checker can re-derive

Scratchpad probes (not committed; W1 re-derives them as committed test code, it must
not depend on them): directory
`C:\Users\alexa\AppData\Local\Temp\claude\C--Users-alexa-OneDrive-Documents-Projects-teaching-assistant\e8e96e62-aa3d-4508-b28a-354d4d297572\scratchpad\`
(a session-scoped temp directory; it may not outlive the session, which is a reason
W1 must re-derive the probes as committed code). Run each as `node <probe>.mjs` from
the repo root.

```
lib.mjs         shared: ground truth (TS parser), tokenizer loader (transpiled from the real file)
census1.mjs     AST spelling census            -> 102 files / 125 sites; [\s\S] 97, [^] 5, OTHER 1
census2.mjs     3 strippers vs truth, 2913 files -> tokenizer 2913 equal; pipeline 532 over + 2 both
census5.mjs     stage attribution, 9 triggers, walker replays, named targets
census6.mjs     defeat fixtures; 75 deleting false openers in 54 files (21 non-test)
census7.mjs     probe-domain gap (32 of 102), triggers in walker set (9 of 9), helper names
census8.mjs     CRLF variant of the whole corpus; S1 raw positive control; five targets' export lines
census9.mjs     runtime read-reach map from trace.log
census10.mjs    readers of the 21 corruptible files
census11.mjs    decision replay of the use-server guard walkers: 504 bodies, 10 differ, 0 guard-set changes
census12.mjs    tokenizer stress: regex literal containing a quote after a bare ) or } -> comment survives
trace-setup.mjs + vitest.trace.config.mjs   the read-tracing run
```

Repo-side measurements: `grep -rlF '[^]*?\*\/' src` (5 files, listed in section 0);
`git ls-files --eol <file>` (the five tests: `i/lf w/lf` except
`prompt-announcement-draft.test.ts` `i/lf w/mixed`); `wc -l` on the probe (649),
tokenizer (405), S1 (609), S3 (410), S2 (75), S4 (214), S5 (46); the baseline
`npm run test:paths` six-argument run in section 8.1; the lint probe in section 6.
Not in this document by design: any `grep -P` result.
