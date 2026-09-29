# A42 scope: the MIME-wildcard block-comment strip defect

Status: SCOPE + ACCEPTANCE CRITERIA ONLY. No production code and no test code
were written or changed for this document. Round 1 of 2 (docs/loop/iteration-
caps.md: two rounds per artifact, then the question goes to the owner). A
fresh `loop-checker` gates this before any build.

Backlog row: `docs/backlog.yml:715` (`id: 'A42'`), filed 2026-09-23. Full row
read in full before writing this scope (`sed -n '715,726p' docs/backlog.yml`,
9,561 characters). This document does not restate that row's prose; it
re-measures every quantity the row cites, because the tree has moved since
2026-09-23 - most recently by the L13 conversion at commit `96015a49`
(`git log -1 --format=%cd --date=short 96015a49` -> `2026-09-29`, i.e. THE
DAY BEFORE this scope was written), which is a different defect in the same
helper family (see `docs/backlog.yml:715`'s own row: "A42 established the
same day that this repo['s] comment-stripping idiom treats a MIME wildcard as
a comment opener... fixing L9 by copying that idiom would WIDEN A42['s] blast
radius"). The L13 residual itself is closed: `src/tools/strip-comments-
agreement.structure.test.ts` is the committed probe (confirmed present,
581 lines, `wc -l src/tools/strip-comments-agreement.structure.test.ts`).

All measurements below were produced with the Grep tool (ripgrep-backed) and
git-bash `grep -F` (never `grep -P`, which `docs/loop/this-repo.md` section 5
documents as exiting 2 on `-P "x"` but exiting 0 - falsely "clean" - on
`-P "\x{1F600}"`, i.e. it can report a real pattern absent). Every count names
the exact command run.

---

## 1. Blast radius (measured today, not assumed from the row)

### 1.1 The population has grown and shifted shape since the row was filed

The row's 2026-09-23 census: "the literal text `[\s\S]*?\*\/` appears in 85
files under src/, 102 occurrences... restricted to `*.test.ts`: 84 files, 101
occurrences; the one file outside that glob is
`src/app/components/ui/modalAdoptionScan.ts:146`."

Re-measured 2026-09-29:

| Command | Result today | Result at filing (row's own text) |
|---|---|---|
| `grep -rlF '[\s\S]*?\*\/' src` | **90 files** | 85 files |
| `grep -rF '[\s\S]*?\*\/' src \| wc -l` | **107 occurrences** | 102 |
| `grep -rlF '[\s\S]*?\*\/' src --include=*.test.ts` | **90 files** (all of them) | 84 |
| files outside `*.test.ts` carrying the literal | **0** | 1 (`modalAdoptionScan.ts:146`) |

The one non-test file is no longer in the population, for a real reason, not
an instrument change: `src/app/components/ui/modalAdoptionScan.ts:16-19`'s own
header now says "THE TOKENIZER, THE TREE WALK AND THE GENERIC CLASSIFICATION
PREDICATES NOW LIVE IN modalAdoptionSourceScan.ts". Confirmed by reading that
file - `grep -n "function stripComments" src/app/components/ui/
modalAdoptionScan.ts` returns nothing; the function now lives at
`src/app/components/ui/modalAdoptionSourceScan.ts:155` and is a hand-written
character-by-character tokenizer (`stack`-based mode machine distinguishing
`code` / `line-comment` / `block-comment` / `string-single` / `string-double`
/ `template`), not a regex. Read in full
(`src/app/components/ui/modalAdoptionSourceScan.ts:155-224`). This is
independent prior work (the row's own note names it "RULING 79... fixed
2026-09-27 at 89980da"), not something this scope did.

**The literal-substring census undercounts even the regex-based population**,
and this scope caught its own instrument doing that before relying on the
number. `src/tools/strip-comments-agreement.structure.test.ts`'s SAFE_FILES
enumeration (measured directly by parsing the array, not by reading the
file's own comment which says "68" - `node` script reading the `SAFE_FILES`
array literal: **67 entries**, `MODE1_BLIND_FILES` and `MODE2_BLIND_FILES`
both **0** today) includes 4 files not in my 90-file census. Opening those 4:
two (`src/app/components/canvas-tab/announcements-panel.wiring.test.ts:28`,
`src/lib/prompt-announcement-types.test.ts:14`) spell the same defect as
`/\/\*[^]*?\*\//g` - `[^]` instead of `[\s\S]`, functionally identical (both
match any character including newline in a JS regex with no `/s` flag) but
invisible to a search for the `[\s\S]` spelling. The other two
(`src/app/components/grading-results/ungradedDisclosure.test.ts`,
`ungradedRowLabel.test.ts`) are genuinely not vulnerable: they are in the
probe's own `BLOCK_COMMENT_UNSUPPORTED` set
(`src/tools/strip-comments-agreement.structure.test.ts:396-399`) because their
`stripComments` never strips `/* */` at all - no block-comment handling to
exploit.

Re-measured with the `[^]` spelling added: `grep -rlF '[^]*?\*\/' src
--include=*.test.ts` -> **5 files**, zero overlap with the 90. Also checked
`[\S\s]*?\*\/` and `[\d\D]*?\*\/` (two more common "match anything" idioms in
hand-rolled JS regexes): **0 files** for each.

**Combined floor across the three spellings actually found: 95 files**, 0
occurrences outside `*.test.ts`. THIS IS A FLOOR, NOT A CEILING - stated
explicitly per `docs/loop/traps-search.md`'s rule that an enumeration is a
floor, never the set. A block-comment stripper written some other way
entirely (a different character-class spelling, a split-based scanner, an
inline arrow function this scope's greps did not anticipate) would not be
caught by any of the four literal searches run here. The next pass over this
population should re-derive it with its own instrument rather than trusting
95, exactly as this scope had to re-derive it rather than trusting the row's
85.

Separately, `grep -n "function stripComments\("` (Grep tool, path `src`, no
glob) finds **70 files** defining a function literally named `stripComments`
- up from the row's 64. This is a DIFFERENT count than the 95/90/85 figures
above: it counts by NAME, the others count by REGEX SUBSTRING. The two
diverge in both directions - some of the 95 use a different name
(`stripSourceComments` in the two `page-module-css-*.test.ts` files below,
which the 70-name-based count and the L13 probe's own enumeration both miss
entirely), and some of the 70 named copies may not carry either vulnerable
spelling (not separately re-verified here; see residual register).

### 1.2 The nine trigger files: reconfirmed unchanged

Re-ran the row's own trigger search: `grep -rnE 'accept="[^"]*(image|video|
audio|text|application)/\*|accept="\*/\*"' src --include=*.tsx --include=*.ts
| grep -v '\.test\.ts'` returns exactly the same 9 real attributes the row
named, at the same lines, plus the same one false-positive prose comment
(`AddCourseForm.tsx:137`, which says `accept="image/*"` in a comment, not a
real attribute):

1. `src/app/account/voice-style/page.tsx:362` (`audio/*`)
2. `src/app/components/caption-studio/VideoSource.tsx:74` (`video/*`)
3. `src/app/components/course-planning/SyllabusMode.tsx:351` (`image/*`)
4. `src/app/components/courses/AddCourseForm.tsx:375` (`image/*`)
5. `src/app/components/courses/TextbookPhotoModal.tsx:358` (`image/*,
   application/pdf`)
6. `src/app/components/recording/SourceDevicesPanel.tsx:449` (`image/*`)
7. `src/app/components/recording/SpeedPanel.tsx:101` (`video/*`)
8. `src/app/components/slide-studio/VideoModeSection.tsx:80` (`video/*`)
9. `src/app/components/slide-studio/VoiceCloneSection.tsx:111` (`audio/*,
   video/webm,video/mp4`)

No tenth trigger file has appeared since 2026-09-23. The population that can
be corrupted is stable; the population of duplicated strippers that COULD
corrupt it grew (85 -> 95 by the broadened count).

### 1.3 Which of the 95 scanners actually reach a trigger file - the load-
bearing question

The row itself only traced two tests end to end (`buttonVariant.test.ts`,
`confirmArmButtons.test.ts`) and said so explicitly. This scope re-verified
those two on today's tree and traced enough of the rest to answer whether
today's tree carries a currently-wrong pass or fail. Every "not sprung"
verdict below was produced by literally executing the file's own
`stripComments`/`stripSourceComments` implementation against the real trigger
file with `node`, not by inspection alone.

Directory-walking or whole-tree-scanning candidates (the only shape that can
reach a trigger file without naming it), found via `xargs -a <90-file-list>
grep -lF "readdirSync"` -> 18 files, then individually opened:

| Scanner | Root walked | Reaches a trigger file? | Verdict, evidence |
|---|---|---|---|
| `src/app/components/ui/buttonVariant.test.ts` (`stripComments` at `:107`, `SECTION_4_DIRS` at `:96`) | `recording/`, `grading-recording/`, `module-deck-capture/`, `caption-studio/`, `slide-studio/`, `ui/`, `message-replies/` | Yes - 5 of 9 (SpeedPanel, SourceDevicesPanel, VideoSource, VideoModeSection, VoiceCloneSection) | **NOT SPRUNG.** Ran the file's real `stripComments` + `countPrimaries` against all 5: `FROZEN_PRIMARY_SITES["...SpeedPanel.tsx"]=1` (`:180`) and `["...VideoModeSection.tsx"]=3` (`:194`) both match today's measured value exactly, and the zero-ternary canary is 0 for all 5. Confirmed the mechanism: SpeedPanel.tsx's `accept="video/*"` at line 101 opens a match that the regex (non-greedy, first `*/` wins) does not close until line 241 - measured directly with `node` (140 lines swallowed) - but the file's one real `variant="contained"` site sits at line 280, outside that span. VideoModeSection.tsx's `/*` at line 80 has no later `*/` in the file at all, so the (non-greedy, must-match) regex fails to match anything there and nothing is deleted. |
| `src/app/components/ui/confirmArmButtons.test.ts` (`walkTsxFiles(path.join(process.cwd(), "src/app/components"))` at `:199`) | all of `src/app/components`, recursive | Yes - all 9 | **NOT SPRUNG.** Re-ran `grep -rl "onBlur" src/app/components --include=*.tsx \| wc -l` -> 21 today (row said 20; +1 is ordinary drift). None of the 21 is one of the 9 trigger files (`grep ... \| grep -E "<9 filenames>"` -> empty). The scan's own pattern (`onBlur` beside a consequence) never has anything to find or hide in these 9 files regardless of corruption. |
| `src/app/components/autoGradeTransition.wiring.test.ts` (F6a, `:412-417`) | `join(process.cwd(), "src", "app")`, recursive, ALL `.tsx` | Yes - all 9 | **NOT SPRUNG - NEW FINDING, not in the row.** This walks every `.tsx` under `src/app` and checks membership in `editsSurface="canvas"` after `stripComments`. Ran the exact code against all 9 trigger files: none contains `editsSurface="canvas"` raw or stripped, and the walk's real answer today is exactly `["GradingTab.tsx","LiveFeedPanel.tsx"]`, matching the frozen expectation at `:417`. This is a BROADER reach than either test the row checked (whole `src/app`, not one section-4 list), and it happens to be safe only because none of the 9 files' content is anywhere near the needle - not because the walk excludes them. |
| `src/app/components/courses/page-module-css-classes.test.ts` (`extractReferences` at `:210`, `stripSourceComments` at `:202`, `findFilesImportingAnyStylesheet(COMPONENTS_ROOT)` at `:343`, `COMPONENTS_ROOT = path.resolve(process.cwd(), "src")` at `:92`) | all of `src`, every file importing any `*.module.css` | Yes - all 9 (each imports at least one `*.module.css`) | **NOT SPRUNG, BUT THE CORRUPTION IS REAL AND MEASURED - NEW FINDING.** All 9 files import `page.module.css` and/or `CoursesTable.module.css`/`RecordingControls.module.css`/`security.module.css`. Ran the real `extractReferences`/`stripSourceComments` against each file's actual local bindings (`styles`, `controls`, `tableStyles`) and compared to the unstripped reference set: **5 of 9 files lose real references to the corrupted span** - `voice-style/page.tsx` (`styles`, loses `remove`, `tip` and reduces several counts), `AddCourseForm.tsx` (`styles`: 26 raw references collapse to 1; `tableStyles`: 3 collapse to 0), `TextbookPhotoModal.tsx` (`tableStyles`: loses `hiddenInput`), `SpeedPanel.tsx` (`styles` and `controls`, loses `ghMeta`, `spinner`, `fieldLg`, `growMeta`, `listRow`, `loadingLine`, `stack`). In every case the deleted set is a SUBSET of the real set (deletion, never fabrication - no case produced a reference that was not really there). Checked whether any of the 20 distinct deleted class names is UNDEFINED in its stylesheet (which would make this test currently wrongly pass): all 20 resolve to a class that IS defined today (verified via the file's own `extractDefinedClasses` regex against the real CSS). **Direction of failure if this ever flips: a genuinely undefined class reference inside one of these corrupted spans would silently not be checked - the guard is disabled for that content, not merely lucky on it.** |
| `src/app/components/courses/page-module-css-orphan-classes.test.ts` (same `stripSourceComments`/`extractReferences` shape, `COMPONENTS_ROOT` at `:38`) | same as above | Yes - same 5 | **NOT SPRUNG.** This is a ratchet on a pinned orphan count (fails only if the count RISES). Checked whether any of the 20 deleted class names above has NO other reference anywhere in `src/app/**/*.tsx` (which would make it newly look orphaned): `grep -rocE` per class name across `src/app --include=*.tsx`, summed - every one of the 20 has 2 or more total references elsewhere in the tree (lowest: `itemBody` at 2, `courseRepoRow` at 3; highest: `fieldHint` at 589). None would flip to "orphan" even with the one reference in the corrupted file deleted. |
| `src/app/components/grading-recording/submission-kind-callsites.structure.test.ts` (`SRC_ROOT = path.resolve(process.cwd(), "src")` at `:41`, `ALL_FILES = walkSourceFiles(SRC_ROOT)` at `:66`) | all of `src`, recursive | Yes - all 9 (reads every file, `stripComments`s it, tests for identifier membership) | **NOT SPRUNG.** The matchers (`suggestedSubmissionKind`, `submissionKindCue`, `SUBMISSION_KIND_LABELS`, etc., `:76-77`) are multi-word grading-domain identifiers that do not appear, in whole or in any fragment that could concatenate across a deleted span, in any of the 9 UI-upload files. No realistic corruption path here. |
| `src/app/actions/action-guard-coverage-github-cohort.test.ts` (`collectActionExports`/`githubReachingActionFiles`, `APP_DIR` at `:35`) | all of `src/app`, recursive | Reads all 9 (`fs.readFileSync`) but never strips them | **STRUCTURALLY IMMUNE, not merely lucky.** `isUseServerModule(text)` (`:94-96`) filters on the RAW, unstripped text before any `stripComments` call; none of the 9 trigger files (UI components) has a `"use server"` directive, so they are excluded before the vulnerable regex is ever invoked on them. |
| `src/app/actions/guard-overtightening.test.ts` (`collectCandidateFiles`, `APP_DIR` at `:122`) | all of `src/app`, recursive | Same as above | **STRUCTURALLY IMMUNE**, same mechanism (`isUseServerModule` gate at `:395` precedes `stripComments` at `:411`). |
| `src/app/components/recording/avatar-script.test.ts` (`recordingDir = path.resolve(process.cwd(), "src/app/components/recording")` at `:606` et al.) | `src/app/components/recording/` only (non-recursive) | Directory contains 2 of the 9 (SourceDevicesPanel.tsx, SpeedPanel.tsx) but the file filter is `/^useAvatar.*\.ts$/` (`:608`) | **STRUCTURALLY IMMUNE** - neither trigger file's name starts with `useAvatar` or ends in bare `.ts` (both are `.tsx`), so neither is ever read by this walker. |
| `src/app/components/grading-recording/grading-rows.test.ts` (`dir`/`sharedDir` at `:650-651`) | `grading-recording/`, `assessment-shared/` | No overlap with any of the 9 directories | Excluded by directory. |
| `src/app/components/grading-results/gradingResultsHelpersWiring.test.ts` (`:235`, `:251`) | its own directory, plus its immediate parent, NON-recursive | No overlap (does not descend into `recording/`, `courses/`, etc.) | Excluded by directory and by non-recursion. |
| `src/app/components/snapshot-grading/snapshot-autofire.structure.test.ts`, `snapshot-grading.structure.test.ts`, `snapshot-role-setrole-callsites.structure.test.ts` | `SNAPSHOT_GRADING_DIR` only | No overlap | Excluded by directory. |
| `src/lib/recording-files.kinds.test.ts`, `src/supabase-migrations.rls-coverage.structure.test.ts` | migrations directory, `.sql` only | No overlap (not `.tsx`) | Excluded by file type and directory. |
| `src/app/components/courses/page-module-css-classes.test.ts`'s and `page-module-css-orphan-classes.test.ts`'s CSS-text `stripComments` calls (`:116`/`:75`/`:100`, distinct from the `stripSourceComments` calls already covered above) | `*.module.css` files | No - operates on CSS text, and none of the 9 trigger `.tsx` files is a `.css` file | Not applicable to this row's trigger population (a `/*` inside a CSS string is a different, unsurveyed risk - see residual register). |
| `src/app/components/repo-grades/repoGradesFeedbackAndFiles.wiring.test.ts` | N/A | N/A | Excluded on re-check: the earlier `readdirSync` hit was a PROSE COMMENT at `:301` mentioning the word, not a real call. `grep -n "readdirSync\|readdir(" <file>` confirms no executable call exists. |
| `src/app/actions/prompt-announcement-draft.test.ts` (`deriveCanvasForbiddenFiles`, `:481-487`), `src/app/components/canvas-tab/announcements-panel.wiring.test.ts` (`deriveCaptureForbiddenFiles`, `:296-302`) | not traced to a confirmed root in this pass | Unknown | **NOT VERIFIED - see residual register.** These two carry the `[^]*?\*\/` spelling and do walk a directory via `readdirSync`, but this scope did not confirm what `dir` resolves to or whether the walk's purpose (deriving a forbidden-import set) ever reads one of the 9 trigger files' content through `stripComments`. Flagged rather than guessed. |

The remaining ~77 of the 95 files (95 minus the 18 checked for `readdirSync`)
each target a fixed `SOURCE_PATH`-style constant rather than walking a
directory (the row's own description of this shape: "each target a single
named SOURCE_PATH outside those roots"). Re-verified this holds today: `for`
each of the 9 trigger filenames, `grep`ped for the bare filename across the
95-file list - the only hits were `buttonVariant.test.ts` (already accounted
for above, via its directory walk, not a single-file target). No single-
target file names a trigger file as its subject.

### 1.4 Verdict: LATENT, not ACTIVE - with the evidence that settles it

**No test in the population traced above currently produces a wrong pass or a
wrong fail because of this defect, as of this tree (2026-09-29).** Six
scanners actually run the vulnerable stripper against real trigger-file
content today; three are provably unaffected by construction (a filter that
runs before stripping, or a filename pattern that excludes the trigger
files); the rest do not reach the trigger files at all. Of the six that do
reach them, two (`page-module-css-classes.test.ts`,
`page-module-css-orphan-classes.test.ts`) genuinely lose real data to the
corruption today - this is not a hypothetical future trap for those two, it
is happening on every run - but the loss has not yet crossed into a wrong
verdict because every affected class name happens to be defined (for the
"classes" guard) and happens to have another reference elsewhere in the tree
(for the "orphans" ratchet). That is a coincidence of today's content, not a
property of the mechanism, which is exactly the row's own framing: "a TRAP,
not yet a sprung one."

This matches `docs/backlog.yml:715`'s own priority note and extends it: the
row checked 2 scanners and found them safe by luck-of-content; this scope
checked 6 that actually reach a trigger file (all safe today, two of them
non-trivially so) plus 3 more that are safe by construction rather than luck,
and leaves 2 unresolved (see residual register) rather than assuming they
match the pattern of the rest.

---

## 2. Fix shape - recommendation, not a decision made here

Three remedies were named in the backlog row. This scope evaluates them
against what is actually in the tree today rather than choosing blind.

### 2.1 Option (a): a committed non-test shared module with a string-aware stripper

**Already built, in this repo, for a related problem.** `src/app/components/
ui/modalAdoptionSourceScan.ts:155-224` is exactly this: a hand-written
character-scanning tokenizer (not a regex) that tracks `code` / `line-
comment` / `block-comment` / `string-single` / `string-double` / `template`
as mutually exclusive modes, so a `/*` inside a string is never treated as a
comment opener. It is battle-tested in this repo already - its own history
(cited in `docs/backlog.yml:715`'s own note, RULING 79 and the JSX-closing-
tag defect fixed at `89980da`) includes two real sabotage rounds and a real
bug found and fixed post-ship. It is imported today by exactly the shape this
repo allows: `src/app/components/ui/modalAdoption.wiring.test.ts:47` and
`src/app/components/ui/modalAdoptionWiring.attributes.test.ts:20` both import
it from a NON-test module, which is why the "no cross-test-file imports" rule
does not apply - the row's own note makes this exact point about the
tokenizer: "the cross-test-file import ban does not apply because the
tokenizer lives in a non-test module." The file itself has ample headroom
(`wc -l src/app/components/ui/modalAdoptionSourceScan.ts` -> 405 lines,
against the 1000-line ceiling at `src/file-size-ceiling.structure.test.ts:41`
- no `ALLOWED_OVERAGE` entry needed).

This is the strongest-evidenced option: it is not merely buildable, it is
already built, already proven, and already the shape a closely related recent
fix in this same file family chose ("RULING 79: a tokenizer, not a third
regex").

### 2.2 Option (b): a correct per-file duplicated form

Consistent with this repo's stated "no cross-test-file imports" convention
(`GradingRecordingPanel.wiring.test.ts:38`), but the L13 conversion already
shows what duplicating a fix 39 times over costs: a real, if narrow, defect
surfaced in exactly one of the 39 (`moduleCard.selection.wiring.test.ts`, an
over-specified fixture) that had to be diagnosed and fixed individually
(`git show --stat 96015a49`). A string-aware stripper is materially harder to
duplicate correctly by hand than the line-comment fix L13 shipped - the
row's own words: "a truly correct block-comment stripper needs string-
literal awareness, which is more than a regex." Duplicating a ~70-line
tokenizer into some subset of 95 files multiplies that same risk by the
number of copies, for no benefit over importing the one that already exists
and is already proven, since option (a)'s import path is already open.

### 2.3 Option (c): a guard/probe pinning agreement, no production fix

`src/tools/strip-comments-agreement.structure.test.ts` already has almost
exactly this instrument for a related axis: `isStringAware()`
(`:256-259`) already exists and is already exercised by `FIXTURE_STRING_
LOOKALIKE` (`:175-177`, a URL containing `//` and a string whose entire
content looks like a self-contained block comment). The current assertion
(`:524-534`, `"no duplicated copy is string-literal-aware (documented
finding, not a pass)"`) deliberately PINS the vulnerability as expected
behaviour today, across all `ALL_DEFINED` (67) copies it knows about. This is
the correct existing instrument to EXTEND, not a fresh invention - but two
gaps in it matter for A42 specifically:

- `FIXTURE_STRING_LOOKALIKE`'s fake comment is FULLY CONTAINED inside one
  string (`"/* ECHO_MARKER not real */"`), which self-closes and therefore
  cannot swallow real code after it. A42's actual shape is different and
  worse: `accept="image/*"` OPENS inside a string but its matching real `*/`
  is elsewhere in the file, outside any string, which is what causes the
  140-line deletion measured in section 1.3. No fixture in the probe today
  exercises an UNCLOSED-WITHIN-STRING opener. This is the fixture gap an
  extension must close.
- The probe's own enumeration (67 files via a name-based `grep`) is narrower
  than the true population (95 by regex-substring, `stripSourceComments` in
  the `page-module-css-*.test.ts` files not tracked under any name the probe
  searches for). Any extension inherits this gap until the enumeration is
  corrected.

### 2.4 Recommendation

**Given section 1.4's verdict (LATENT, not ACTIVE), a repo-wide simultaneous
migration of all 95 duplicates is not justified by an active defect, and the
row's own caution applies: "any fix, even applied to only one copy, changes
what THAT copy's dependents see, and a repo-wide fix changes it for all 85
[95]... needs a FROZEN ORACLE." A blanket sweep is the wrong shape here for
the same reason the row gives for L9's blast radius, scaled down.**

Recommended shape, smallest-first:

1. **Extend the existing probe first** (`src/tools/strip-comments-agreement.
   structure.test.ts`), adding the unclosed-within-string fixture described
   in 2.3, and CORRECT its enumeration to include the `stripSourceComments`-
   named copies and the `[^]`-spelled copies this scope found outside it.
   This is cheap, uses an instrument this repo already trusts, and makes the
   latent trap machine-checkable rather than merely documented in a backlog
   note. It ships no behaviour change to any production or test file's
   OUTPUT - only new assertions.
2. **Convert, one file at a time, only the six scanners in section 1.3 that
   demonstrably reach a trigger file today** (`buttonVariant.test.ts`,
   `confirmArmButtons.test.ts`, `autoGradeTransition.wiring.test.ts`, the two
   `page-module-css-*.test.ts` files, `submission-kind-callsites.structure.
   test.ts`), replacing each file's own regex-based stripper with an import
   of the string-aware tokenizer from `modalAdoptionSourceScan.ts` (or a
   copy promoted to a more generically-named shared module if importing a
   modal-adoption-specific file into unrelated test families reads wrong to
   the architect pass - a naming/placement call this scope defers rather
   than makes). Each conversion needs its own frozen-oracle proof (per the
   "guard before migration" practice this repo already uses for L13) that no
   OTHER stripping decision in that file changes - the L13 conversion's own
   near-miss (`moduleCard.selection.wiring.test.ts`) is the concrete reason
   this cannot be skipped.
3. **The remaining ~89 copies stay a later, lower-priority wave**, tracked by
   the corrected probe from step 1 rather than re-derived by hand each time.
   This mirrors how L13 itself phased: fix the live instance, then convert
   the rest of the population once the instrument that tracks it is trusted.

This is a recommendation for the architect/test-author pass that will own the
actual conversion design, not a ruling made here - per the task brief, "the
scope or architect pass that picks among (1)-(3)" is `docs/backlog.yml:715`'s
own OWNER field for this decision, and this scope agrees with that framing
rather than overriding it.

---

## 3. Acceptance criteria

Each criterion names the object under comparison, the instrument that
produces each quantity in it, and the direction of failure.

**AC1 - Probe fixture covers the actual A42 shape, not just a look-alike.**
Object: `src/tools/strip-comments-agreement.structure.test.ts`'s fixture set.
Instrument: a new fixture whose `/*` opens inside a string literal and whose
matching `*/` lies OUTSIDE any string, later in the same input (mirroring
`accept="video/*"` ... real code ... unrelated `*/`), run through each
tracked copy's extracted function body exactly as `classify()`/`isStringAware
()` already do. Direction of failure: RED if any currently-`SAFE_FILES`
tracked copy deletes the real code between the string-embedded `/*` and the
later `*/` (i.e. behaves exactly as measured in section 1.3); GREEN only for
a copy whose stripper is string-aware (proven first against
`modalAdoptionSourceScan.ts`'s tokenizer, which section 2.1 established is
already string-aware).

**AC2 - The probe's enumeration is corrected, and the correction is itself
checked.** Object: the set of files the probe's `ALL_DEFINED` covers versus
the true population of duplicated block-comment strippers. Instrument: the
probe's own enumeration re-derived to include name variants
(`stripSourceComments` and any other name discovered) in addition to
`stripComments`, and both `[\s\S]` and `[^]` (and any further spelling found
by the pass that does this work) block-comment idioms - not a hand-maintained
list, per `docs/loop/traps-spec.md`'s rule that an orchestrator's or a prior
pass's enumeration is a floor, never the set. Direction of failure: RED if a
canary file deliberately added under a new name or spelling is absent from
the corrected enumeration.

**AC3 - No regression to the L13 trailing-comment/CRLF behaviour.** Object:
every file this AC's own work touches. Instrument: `src/tools/strip-
comments-agreement.structure.test.ts`'s existing `classify()` assertions
(`"classifies every safe copy as safe on both the CRLF and trailing-comment
axes"`, currently asserted for all `SAFE_FILES`) plus, for any two-or-more-
file check, the wrapper form: `npm run test:paths src/tools/strip-comments-
agreement.structure.test.ts <each converted file's own *.test.ts>` - never a
raw multi-path `vitest`/`npm test` invocation, which silently drops an
unmatched path and exits 0 (`docs/loop/this-repo.md` section 1). Direction of
failure: RED if any converted file's `classify()` result moves away from
`"safe"`, or if `MODE1_BLIND_FILES`/`MODE2_BLIND_FILES` gain an entry.

**AC4 - The MIME-wildcard case is proven handled, with real content
surviving.** Object: a fixture (new, added under this AC) reading
`accept="image/*"` followed by real, distinctive code the assertion checks
for by name. Instrument: run the SAME stripper under test against that
fixture; direction of failure: RED if the distinctive code after the
wildcard is deleted (the corrupted behaviour, reproduced synthetically);
GREEN only when the code after the wildcard survives stripping AND the
wildcard's own quotes are still correctly recognised as a string (so the fix
is not merely "never treat `/*` as a comment," which would silently disable
real block-comment stripping everywhere - `supportsBlockComments()`
(`:261-266`) must still return true for the same copy on
`FIXTURE_BLOCK_MULTILINE`).

**AC5 - Each of the six live-reaching scanners identified in section 1.3
keeps its existing assertions' truth value after conversion.** Object: each
of `buttonVariant.test.ts`, `confirmArmButtons.test.ts`, `autoGradeTransition.
wiring.test.ts`, `page-module-css-classes.test.ts`, `page-module-css-orphan-
classes.test.ts`, `submission-kind-callsites.structure.test.ts`'s full
assertion set. Instrument: re-run every assertion in the file before and
after its own conversion (a frozen-oracle diff, per the "guard before
migration" practice), comparing actual output, not just pass/fail - a test
that stays green for a different reason is not proof of no regression.
Direction of failure: RED if any assertion's ACTUAL VALUE changes (not only
if a `toEqual`/`toBe` newly fails) - the L13 near-miss
(`moduleCard.selection.wiring.test.ts`) was exactly a case where the
mechanical conversion changed a value while the specific assertion under test
still happened to read the same literal.

**AC6 - The two currently-silently-weakened checks (`page-module-css-
classes.test.ts`, `page-module-css-orphan-classes.test.ts`) are proven to
newly catch what they miss today.** Object: `AddCourseForm.tsx`'s `styles.`
references (26 real, only 1 currently checked, per section 1.3's measurement).
Instrument: after conversion, introduce a synthetic undefined-class reference
inside what is today's corrupted span (e.g. a deliberately misspelled
`styles.adaptPnaelTitle`) in a throwaway fixture copy, and confirm the
converted stripper's extraction now includes it and the "every reference
resolves to a defined class" assertion goes RED. Direction of failure: this
is the removal-test analogue for a bug fix - GREEN (undetected) before the
fix, RED (caught) after; a fix that cannot be shown to flip this is not
proven to have removed the defect.

---

## Disposition table

Not applicable. This is the first scope authored for A42; there is no prior
scope of this item to restructure, so `docs/loop/iteration-caps.md`'s
disposition-table requirement (for restructuring rounds) does not apply here.
The backlog row itself (`docs/backlog.yml:715`) is treated as an input this
scope re-measures against, not a prior scope this document supersedes.

---

## Residual register

Each entry names an owner, an instrument, and the step that will measure it.
A residual missing any of those three is a deletion, not a residual.

1. **Two `readdirSync`-based scanners not traced to a verdict**
   (`src/app/actions/prompt-announcement-draft.test.ts`'s
   `deriveCanvasForbiddenFiles` at `:481-487`, and `src/app/components/
   canvas-tab/announcements-panel.wiring.test.ts`'s
   `deriveCaptureForbiddenFiles` at `:296-302`). OWNER: the implementer wave
   that does the conversion work in section 2.4 step 2, before closing this
   row. INSTRUMENT: open both `walk()` closures in full, determine each
   `dir` root by tracing its caller, and re-run the same node-script
   methodology used in section 1.3 against any of the 9 trigger files the
   root reaches. STEP: before any claim that "all reaching scanners are
   accounted for" is made in a later round of this item.

2. **The 95-file floor is not a ceiling.** OWNER: whichever pass performs
   AC2 (the enumeration correction). INSTRUMENT: `ts.createSourceFile`-based
   AST enumeration (the same approach `src/tools/strip-comments-agreement.
   structure.test.ts` already uses to extract function bodies) searching for
   any `.replace(` call whose regex argument's source contains an
   unescaped-newline-matching construct followed eventually by `\*\/`,
   rather than a literal-substring grep - this closes the exact gap that let
   the `[^]` spelling and the `stripSourceComments` name escape this scope's
   own census. STEP: the same pass that does AC2.

3. **The 70-file, name-based `"function stripComments("` count was not cross-
   checked against the 95-file regex-substring count for exact overlap**
   (which named copies use neither vulnerable spelling; which of the 95 use
   an unnamed/inline form). OWNER: the AC2 pass. INSTRUMENT: a set
   intersection/difference script, structurally identical to the one this
   scope used in section 1.1 to reconcile the L13 probe's 67 against this
   scope's 90/95. STEP: same pass as residual 2.

4. **CSS-text comment stripping (`page-module-css-classes.test.ts:116`,
   `:203`; `page-module-css-orphan-classes.test.ts:75`, `:100`) was noted but
   not investigated as its own risk** - a `/*` inside a CSS string value
   (rare but legal, e.g. a `content: "/* not a comment */"` declaration)
   could exhibit the same class of defect against `*.module.css` files
   rather than `.tsx` files. This is explicitly OUT OF SCOPE for A42 as
   filed (A42's trigger population is the 9 MIME-wildcard `.tsx` attributes),
   but is the same mechanism. OWNER: unassigned - recorded here so it is not
   silently folded into A42's fix or silently lost. INSTRUMENT: a census of
   `content:\s*"[^"]*\/\*` (or similar) across `*.module.css` in `src/`.
   STEP: a future backlog row, if anyone chooses to file one; not a blocker
   for A42's own disposal.

5. **No fix, migration, or probe extension was executed by this scope** -
   by design (scope-only round). OWNER: the architect/test-author pass named
   in section 2.4 as the receiver of this recommendation. INSTRUMENT: the
   acceptance criteria in section 3, each already naming its own instrument.
   STEP: the next activity on this item (a design/wave-plan pass consuming
   this scope), which per `AGENTS.md`'s "Two rounds, then ask" is a NEW
   activity with its own two rounds, not a continuation of this one.

---

## What this scope could not determine

Per `docs/loop/this-repo.md` section 6 and the loop-seat brief's instruction
not to fill these in:

- Whether `npm test`'s full 20,000-plus-test suite is green on this tree
  right now was NOT re-run as part of this scope (this is a documentation-
  only artifact touching no `src/` file; per `docs/loop/seats.md`'s
  documentation-only trigger table, acceptance-criteria and test-seat triage
  out for a docs-only chunk, and this scope's own gate is `npm run docs:gate`
  at build time, not a full suite run here).
- No component is rendered by any test in this repo (`docs/loop/this-repo.md`
  section 2); nothing in this defect or its fix touches markup, focus, or
  keyboard behaviour, so this limitation does not bind this item, stated
  here only for completeness.
- Whether any file among the ~89 "remaining" duplicates (outside the six
  traced in section 1.3) has some OTHER, not-yet-discovered path to one of
  the 9 trigger files (an indirect import, a fixture that embeds one file's
  content into another's test) was not exhaustively ruled out. The census in
  section 1.3 covers every directory-walking or whole-tree scanner found by
  the `readdirSync` grep and every single-target file matched by filename
  against the 9 trigger files; it does not rule out a scanner that reads a
  trigger file's content indirectly (e.g. via a fixture copy-pasted from it).
  No evidence of this was found, but absence-by-unchecked-mechanism is not
  the same as absence.

---

## Commands run (measurement log)

For re-derivation without re-reading this whole document:

```
sed -n '715,726p' docs/backlog.yml                              # full A42 row
git log -1 --format=%cd --date=short 96015a49                    # L13 commit date
wc -l src/tools/strip-comments-agreement.structure.test.ts        # 581
grep -rlF '[\s\S]*?\*\/' src                                      # 90 files
grep -rF  '[\s\S]*?\*\/' src | wc -l                              # 107 occurrences
grep -rlF '[\s\S]*?\*\/' src --include=*.test.ts                  # 90 (all of them)
grep -rlF '[^]*?\*\/' src --include=*.test.ts                     # 5 files, disjoint
grep -rlF '[\S\s]*?\*\/' src --include=*.test.ts                  # 0
grep -rlF '[\d\D]*?\*\/' src --include=*.test.ts                  # 0
grep -n "function stripComments(" -> Grep tool, path src          # 70 files
grep -rnE 'accept="[^"]*(image|video|audio|text|application)/\*|accept="\*/\*"' \
  src --include=*.tsx --include=*.ts | grep -v '\.test\.ts'       # 9 real triggers, unchanged
grep -rl "onBlur" src/app/components --include=*.tsx | wc -l      # 21 (row said 20)
wc -l src/app/components/ui/modalAdoptionSourceScan.ts            # 405
node <ad hoc scripts replaying each file's own stripComments/countPrimaries/
     extractReferences against the 9 trigger files, per section 1.3>
```
