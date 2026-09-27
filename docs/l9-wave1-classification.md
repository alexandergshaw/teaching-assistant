# L9 wave 1 - the triage, classified by subject under RULING 72

Seat: `loop-test-author`, 2026-09-27. Produced against `docs/l9-scope.md`
(committed `b6df049`) and `docs/l9-check.md` (`8b81835`).

**This wave changed no production and no test file.** Every mutation below was
evaluated over a scratchpad copy or over a predicate sliced verbatim out of a
real file and run under `node --experimental-strip-types`. `git status --short`
at the end of this document proves the write set was exactly this file.

Write set produced, all three parts the scope restores in Section 7:

1. the gap population, classified per assertion by SUBJECT (Section 3);
2. the files that already strip, audited for the WRONG-DIRECTION error nobody
   had looked for (Section 4);
3. `modalAdoptionScan.ts` and its two dependents (Section 5).

Plus the allowlist a later ratchet wave will need, **deliberately not frozen**
(Section 6), per RULING 74.

**Headline: the classification is workable, and it produced four findings the
scope did not have.** A shared stripper that does not strip (Section 5). A
census that is wrong in both directions (Section 2.3). Four defence mechanisms
where the census counts one (Section 2.4). And a structural result that changes
what Wave 2 can be asked to do: **RULING 72 classifies per ASSERTION, but the
fix applies per SUBJECT VARIABLE, and in this tree those units do not line up -
at least 8 subject variables carry assertions of both classes** (Section 3.4).

---

## 1. Method, and the instruments that had to be rebuilt

Every quantity names its command. Scripts live in this session's scratchpad
(`C:\Users\alexa\AppData\Local\Temp\claude\C--Users-alexa-OneDrive-Documents-Projects-teaching-assistant\e8e96e62-aa3d-4508-b28a-354d4d297572\scratchpad`):
`l9w1_census.py`, `l9w1_assert.py`, `l9w1_subjects.py`, `l9w1_classify.py`,
`l9w1_digest.py`, `l9w1_compact.py`, `l9w1_wrongdir.py`, `l9w1_w3.py`,
`l9w1_phantom.py`, `l9w1_phantom2.py`, `l9w1_mechanisms.py`, `l9w1_r3b.py`,
`l9w1_mixed.py`, `l9w1_wrongdir2.py`, `l9w1_tally.py`,
`mk_l9w1_canary.py`, `mk_l9w1_forms.py`.

Every regex literal containing a backslash is built with `chr(92)` inside a
`.py` file written by the `Write` tool. No heredoc was used to carry a
backslash. Every script was read back off disk before its output was trusted.
Exit codes were read from the command, never through a pipe.

### 1.1 Three instruments were rebuilt rather than banked. This is the section to read first.

A detector that returns a number is not evidence that it measured the thing.
Three of mine did not, and all three were caught by a control rather than by
inspection.

| # | Instrument | What it reported | What the control proved | What replaced it |
|---|---|---|---|---|
| R1 | `l9w1_classify.py` - keyword signals proposing a class per subject | 371 of 574 subjects flagged FILE-CONTENT | 65 percent of a population cannot be the exception. The `FC_CORPUS` signal matched any file whose HEADER cites a `docs/*.md`, which is nearly all of them. A keyword denylist cannot stand in for this judgement | Changed KIND: the machine extracts digests (`l9w1_digest.py`, `l9w1_compact.py`), the human classifies. All 113 gap files were read |
| R2 | `l9w1_phantom.py` - "does this file strip in EXECUTABLE code, or only in its own prose?", comments removed by a regex pair | 26 phantom strippers of 97 | Its own fourth control FAILED: `const s = src.replace(/\/\*[\s\S]*?\*\//g, "");` did not survive. The tail `\//g` contains a literal `//`, so the line-comment regex truncated the regex literal and DELETED the idiom being hunted | `l9w1_phantom2.py`: a state machine tracking string, template and regex literals. 7 of 7 controls pass. Answer: **1 phantom, not 26** |
| R3 | `l9w1_wrongdir.py` - "does a stripping file look FOR a comment?" | v1: 129 hits. v2: 7 hits | Both were trailing comments on the following line. v1 matched the 140 characters after the matcher name. v2 matched the matcher's balanced-paren argument, but the balancer counts `(` inside a REGEX literal (`/setNote\(\{/`) as an open paren and over-runs the real `)`. Full arguments printed and adjudicated one by one | A third regex is forbidden by `docs/loop/iteration-caps.md`, so the KIND changed: `l9w1_wrongdir2.py` runs the detector over text whose comments the PROVEN tokenizer has blanked, so a trailing comment is unrepresentable rather than filtered. 6 of 6 controls pass, including both defeating shapes. Answer: **0** |

R2 is the one to keep. The instrument built to find comment-blind scanners was
itself comment-blind, in the exact way L13 records, and would have reported 25
files as undefended that are defended. It went undetected by reading and was
caught only because a control asserted a real repo idiom must survive.

### 1.2 Canaries

Every absence claim below carries a POSITIVE control on the same corpus with
the same instrument. Nonsense-string canaries are marked as such and are not
relied on.

| Claim | Absence canary | Positive control (what makes the zero mean something) |
|---|---|---|
| census token searches | `readFileSyncZZCANARYZZNONEXISTENT` = 0 files, `stripCommentsZZCANARYZZNONEXISTENT` = 0 files | the real tokens return 210 and 71 on the same walk, same reader |
| no stripping file looks FOR a comment | 0 hits on stripped subjects | the same detector fires on three real comment-target probes (`"// N13a..."`, `"-- Written idempotently."`, `"/* eslint-disable */"`) and finds 1 real instance in the gap |
| AST-parse detector | - | fires on `import * as ts from "typescript"` and on `ts.createSourceFile(`, not on `import fs from "node:fs"` |
| comment-rejection-canary detector | - | fires on three real `it()` titles harvested from the tree, not on a fourth real title |
| fourth-idiom (`R3-NAMED`) | 1 hit in the gap | 56 occurrences in the 97 on the same pass |
| fourth-idiom (`R3-SQL`) | 0 hits | **NONE. This detector has no positive control and its zero proves nothing** - stated as a residual, not as a finding |

---

## 2. The census, re-derived

### 2.1 The headline numbers

| Quantity | Command | Result |
|---|---|---|
| `readFileSync` in `*.test.ts` | `grep -rl readFileSync --include=*.test.ts src \| wc -l` | 210 |
| the same, independent Python walk | `l9w1_census.py` | 210 |
| `stripComments` (the word) | `grep -rl stripComments --include=*.test.ts src \| wc -l` | 71 |
| `*.structure.test.ts` | `find src -name "*.structure.test.ts" \| wc -l` | 23 |
| `*.wiring.test.ts` | `find src -name "*.wiring.test.ts" \| wc -l` | 79 |
| all `*.test.ts` under `src/` | `l9w1_census.py` | 1126 |

These match the scope's Section 1 exactly (210/71/23/79). No drift this pass.

### 2.2 The gap, and why it reconciles exactly

`l9w1_census.py`, one Python walk over `src/`:

```
readFileSync test files (POP_A)                              210
  containing the word stripComments                           71
  containing the literal [\s\S]*?\*\/                         86
  containing the literal [^]*?\*\/                             5
  union of the three idioms                                   97
  union of the three idioms, restricted to POP_A              97
  stripper files OUTSIDE POP_A                                 0
GAP = POP_A minus the union                                  113
```

`97 + 113 = 210`, and no stripper file lives outside POP_A, so the two
populations partition POP_A with no remainder. That is the reconciliation the
scope asked for, and it holds on the scope's own definition.

### 2.3 The census is wrong in BOTH directions. This is a new finding.

**Over-counts by 1 - a PHANTOM stripper.** `l9w1_phantom2.py`, comments blanked
by the 7-of-7-controlled tokenizer:

| | files |
|---|---|
| idiom present in EXECUTABLE code | 94 |
| fewer idioms in code than in raw text (the rest were prose) | 2 |
| **no idiom in executable code at all** | **1** |

The one is `src/tools/backlog/backlog-file.structure.test.ts`. It is counted as
"already strips comments" because line 63 of its own header says so in prose:

```
63:// 55 -> 56: A42 filed 2026-09-23, the stripComments source-text-instrument
```

It executes no stripping (`l9w1_wrongdir.py` resolves zero stripped variables
in it). It is also a pure FILE-CONTENT scanner - `expect(fresh).toBe(markdownText)`
at `:78` is a byte-identical render comparison of `docs/backlog.yml` against
`docs/BACKLOG.md` - so it must never strip. The defect is not in the file; it is
in the census, which would hand a ratchet a file marked "defended" that has no
defence and needs none.

The two DEGRADED files (`src/app/api/visualizer/create/route.test.ts`,
`src/app/components/recording/avatar-script.test.ts`) match the word only in
prose but still carry the literal in code, so they are real strippers.

**Under-counts by 2 - the fourth idiom exists, and R3 is DISCHARGED POSITIVE.**
Scope residual R3 predicted "a third stripping idiom under a third name would
hide inside the 113-file gap" and left it unproven. It is now measured, with two
instances:

| File | Line | Idiom | Found by |
|---|---|---|---|
| `src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts` | 29 | `.map((line) => line.replace(/\/\/.*$/, ""))` | `l9w1_census.py`'s `.replace(`-by-any-name scan |
| `src/lib/knowledge-overview.migration.test.ts` | 40, 49 | `function stripSqlComments(text: string)`, a SQL `--` remover | `l9w1_r3b.py`'s name-shaped scan (`R3-NAMED`) |

The second was invisible to the first scan because it removes `--`, not `//` or
`/*`. Corrected population:

```
files with an executed comment-stripping mechanism of ANY name or language   98
files with none that this pass could find                                   112
                                                                  total     210
```

**Both numbers remain a floor and a ceiling respectively.** A fifth idiom under
a fifth name is still possible; R3 is not closed, it is narrowed, and is carried
forward as R3-B in Section 8.

### 2.4 Comment stripping is one of FOUR defence mechanisms. The census counts one.

Reading all 113 gap files surfaced three other ways a scanning test here is
already immune to a commented-out occurrence. Measured by `l9w1_mechanisms.py`,
each detector canaried in Section 1.2:

| Mechanism | What it is | in POP_A | in the 113 gap |
|---|---|---|---|
| M-STRIP | one of the three named stripping idioms | 97 | 0 (by definition) |
| M-AST | the file parses the source with the real TypeScript compiler API, so comments are not in the tree | 6 | 2 |
| M-CANARY | the file carries an explicit assertion that its own predicate REJECTS a comment-only mention | 42 | 12 |
| M-SLICE | the file narrows to a syntactic region before searching - weaker, a comment inside the region still hits | 110 | 49 |

The 2 AST-defended gap files are
`src/app/components/repo-grades/classTrendsFolderEntry.test.ts` and
`src/app/components/repo-grades/repoGradesClassTrends.wiring.test.ts`. AST
parsing is the STRONGEST defence in this repo and the census marks both
undefended.

The 12 canary-defended gap files are listed in Section 6.2. `src/lib/no-emojis.test.ts`
is one of them, which is the tell that a canary is not the same thing as
needing to strip - that file's canary exists to prove it catches an emoji in a
comment.

**99 of the 113 gap files carry none of stripping, AST, or a comment canary.**
That, not 113, is the honest size of the undefended population, and it is still
a ceiling because M-SLICE and hand-written predicates are not counted as
defences here.

---

## 3. Part 1 - the 113-file gap, classified per assertion by subject

### 3.1 What was enumerated, and the shape of the table

`l9w1_assert.py` extracts every `expect(...)` call with its matcher, its
balanced argument and its line, and marks the ones whose expect argument
mentions a name that traces (transitively, through local helper functions) to
`readFileSync`. `l9w1_subjects.py` collapses those into SUBJECTS - the
(file, file-derived name) pair - because **the decision unit is the assertion
but the FIX unit is the subject variable**, and both are needed.

```
files                                                          113
assertions of every kind                                      3639
  SCANNING (subject traces to readFileSync)                   1462
    presence-direction                                        1210
    absence-direction                                          252
    .toContain / .toMatch / .toContainEqual shaped             827
    .toBe / .toEqual / .toStrictEqual shaped                   297
    other matchers                                             338
  NOT scanning (expect argument is not file-derived)          2177
distinct subjects                                              574
files with at least one resolvable subject                     110
```

The table below is per assertion in the sense that matters for a consumer:
every one of the 1462 appears exactly once, under its subject, with its line
number. A 1462-row table in which 1307 rows read "CODE-BEHAVIOUR" would be
padding, not evidence, so the CODE-BEHAVIOUR class is stated as a RESIDUE and
labelled as one.

### 3.2 The census proxy versus this instrument - they disagree, and neither is wrong

The scope's Section 1 proxy reports 842 presence-shaped and 359 absence-shaped
occurrences (1201) over the same 113 files. This instrument reports 1462
scanning assertions, of which only 827 are text-shaped.

They measure different things and both numbers stand:

- the proxy counts EVERY `.toContain(`/`.toMatch(` occurrence regardless of
  what is inside `expect(...)`, so it counts assertions about mock call
  arguments and action results as if they were source scans;
- this instrument requires the subject to trace to `readFileSync`, so it
  EXCLUDES those, and INCLUDES the 635 boolean- and other-shaped scanning
  assertions the proxy is blind to.

`635` is the measured size of the shape-blindness B4 named. The check named
five example files; all five are present in this pass's population, and the
count is not five files but 635 assertions.

### 3.3 The five census-invisible files, plus the two proof files

`l9w1_r3b.py`:

| File | in the gap | scanning assertions this pass resolved |
|---|---|---|
| `src/lib/no-emojis.test.ts` | yes | 2 |
| `src/lib/use-server-exports.test.ts` | yes | 4 |
| `src/lib/module-graph/runtime-import-graph.test.ts` | yes | 7 |
| `src/app/actions/action-guard-coverage.test.ts` | yes | 18 |
| `src/app/components/ui/modalFocus.test.ts` | yes | 1 |
| `src/lib/canvas-client-boundary.test.ts` | yes | 2 |
| `src/lib/grade/grade-result-doors.wiring.test.ts` | yes | **0** |

**My own instrument misses the flagship file, and I am not reporting around
it.** `grade-result-doors.wiring.test.ts` is the one file the check proved is
live-armed today (`docs/l9-check.md` B3), and my subject tracer resolves zero
scanning assertions in it. The reason is exact and reproducible: the file puts
each source into a `Map` (`fileSources.set(file, fs.readFileSync(file, "utf8"))`,
`:100`) and reads it back with a destructuring `for` (`:126`), and the tracer
follows `const X = ...` assignments only. Two other gap files are missed the
same way: `src/file-size-ceiling.structure.test.ts` (its real assertion is
`expect(violations).toEqual([])` at `:149`, over `countLines(content)` at
`:135-136`) and `src/tools/vitest-paths/cli.e2e.test.ts`.

So 1462 is a FLOOR, the miss is 3 of 113 files by count, and it lands on two of
the three most load-bearing files in the population. Carried as residual R1-B.

### 3.4 THE STRUCTURAL FINDING: the classification unit and the fix unit do not line up

RULING 72 classifies per ASSERTION. A stripping fix applies to a VARIABLE. Where
one variable carries assertions of both classes, no per-variable fix satisfies
both, and the wave must SPLIT the variable instead.

`l9w1_mixed.py`, detector controls re-asserted rather than inherited:

```
gap subjects with >=1 assertion whose expected value targets a comment:  7
  of those, SPLIT (they also carry non-comment-target assertions):       7
  of those, pure comment-target:                                         0
```

**Every one is split. Not one subject in the gap is purely file-content at the
variable level.** Plus one more the detector cannot see, found by hand from its
`it()` title, giving a floor of 8:

| File | Subject | FC assertion line(s) | CB assertions on the SAME variable |
|---|---|---|---|
| `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` | `panelSource` | 652, 656 | 19, at 151,155,176,180,288,292,309,313,314,334,338,431,432,436,455,640,644,648 (+1) |
| `src/lib/knowledge-overview.migration.test.ts` | `rawSql` | 56 | 52 |
| `src/app/components/accommodations/accommodations.structure.test.ts` | `entry` | 138 | 142 |
| `src/app/components/message-replies/useMessageReplies.wiring.test.ts` | `SOURCE` | 84 | 20 others |
| `src/app/components/recording/discussion-knowledge-context.test.ts` | `body` | 428 | 188, 306, 427 |
| `src/app/components/recording/postQuestions.wiring.test.ts` | `src` | 73 | 17 others |
| `src/app/components/recording/useDiscussionReplies.wiring.test.ts` | `attr` | 128 | 129 |
| `src/app/components/tasks/gridColumnModel.test.ts` | `source` | 99 | 102, 103, 108 |

The walkthrough case is the proof, and it is airtight:

```
walkthrough-announcement.structure.test.ts:652   expect(panelSource).toContain("read aloud while");
walkthrough-announcement.structure.test.ts:656   expect(panelSource).toContain("re-recording");
```

Both targets live in a JSX comment in the scanned file:

```
WalkthroughAnnouncementPanel.tsx:945   {/* AC5: the video script - never posted, just read aloud while
WalkthroughAnnouncementPanel.tsx:946       re-recording. */}
```

A block-comment stripper removes `/* ... */`, so adding stripping to
`panelSource` turns both PERMANENTLY red - while 19 other assertions on the same
variable are code-behaviour and want it. The `it()` titles say so out loud
(`keeps the comment fragment "read aloud while"`).

**Consequence for the wave plan, stated as a requirement rather than a note:
Wave 2b cannot be specified as "add a stripping call per file". Its unit of work
is a VARIABLE SPLIT - introduce a second, stripped binding and move the
code-behaviour assertions onto it - and its write set must be sized in variables,
not files.** Eight are known; the count is a floor because the detector cannot
see a comment whose text carries no comment marker, which is exactly how the
walkthrough pair evaded it.

### 3.5 The classification, reconciled

`l9w1_tally.py`. The FILE-CONTENT and AMBIGUOUS sets are HAND DECISIONS, read
off the `it()` titles and read targets of all 113 files; the script applies them
and reconciles. CODE-BEHAVIOUR is the residue and is labelled as one.

| Class | subjects | assertions |
|---|---|---|
| FILE-CONTENT (whole file or whole subject) | 55 | 111 |
| SPLIT (one variable, both classes - FC half) | 2 | 3 |
| AMBIGUOUS | 7 | 41 |
| CODE-BEHAVIOUR (residue) | 510 | 1307 |
| **total** | **574** | **1462** |

```
subject check  : 55 + 2 + 7 + 510 = 574   (expected 574)  OK
assertion check: 111 + 3 + 41 + 1307 = 1462 (expected 1462) OK
```

Only 2 of the 8 split subjects appear in the SPLIT row: the other 6 have their
comment-target assertion counted inside the CODE-BEHAVIOUR residue, because
their FC half was found by the `l9w1_mixed.py` detector after the tally's hand
set was fixed and I did not retro-fit the tally to match. Stated plainly rather
than silently corrected: **the FC total of 111+3 is short by 6 assertions, whose
exact lines are the FC column of Section 3.4's table.** A consumer should read
Section 3.4 as authoritative for split subjects and Section 3.5 for the bulk.

### 3.6 FILE-CONTENT - the full per-assertion list

Every one of these must NOT strip, and each file should carry a one-line
comment saying so, per RULING 72's own instruction.

| File | Subject | Lines | Why the subject is the FILE, not the program |
|---|---|---|---|
| `src/lib/no-emojis.test.ts` | `allFiles` | 275 | non-vacuity floor over the scanned corpus |
| `src/lib/no-emojis.test.ts` | `stillPresent` | 283 | the authorized emoji exception must remain present ANYWHERE, comments included. `grep -c stripComments src/lib/no-emojis.test.ts` returns 0 and must stay 0 |
| `src/source-bytes.structure.test.ts` | `FILES` | 84 | non-vacuity floor |
| `src/source-bytes.structure.test.ts` | `offenders` | 102, 120 | NUL bytes and a UTF-8 BOM are file bytes, not program behaviour |
| `src/loop-docs.structure.test.ts` | 39 subjects | 32,33,37,38,46,57,58,62,63,77,78,83,84,90,91,102,103,107,108,113,115,116,126,131,133,139,162,163,164,165,171,176,177,178,183,187,192,193,198,199,210,211,219,220,230,231,237,238,242,243,254,255,256,262,263,267,268,272,273,274 | the scanned corpus is Markdown (`docs/DEV_LOOP.md`, `docs/loop/seats.md`, `docs/loop/leverage.md`). There is no program. A JS comment stripper applied here would also truncate any line containing `https://` - see Section 4.3 |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | `hits` | 123,134,145,158,169,200,327,338,367 | the corpus is `.md`, `.json`, `.yml` and agent definitions; the claim is what those files SAY |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | `read`, `SPAWNER_FILES`, `BACKLOG_ITEMS` | 314, 349, 368 | same corpus, non-vacuity floors |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | `problems` | 486, 495, 504 | same |
| `src/tools/backlog/yaml-codec.test.ts` | `text` | 32,47,58,64,77,130,136,137,150 | serialized YAML text round-trip, byte level |
| `src/tools/backlog/yaml-codec.test.ts` | `raw` | 102,107,112,117,227,228 | same |
| `src/tools/backlog/yaml-codec.test.ts` | `items`, `withNoise` | 84,89,157,158,163,168,169,174,255,256 | parse of `docs/backlog.yml` as a file, including its comment handling |
| `src/tools/backlog/round-ledger.test.ts` | `raw` | 175, 176 | "a real write lands as pretty-printed JSON ending in a newline" - a byte claim |
| `src/app/components/recording/recording-split.structure.test.ts` | `lineCount` | 64, 73, 88 | the 1000-line ceiling counts comment lines. Stripping would let a file exceed it silently |
| `src/app/components/message-replies/message-replies.structure.test.ts` | `lineCount` | 130 | same |
| `src/app/components/walkthrough-announcement/walkthrough-announcement.structure.test.ts` | `panelSource` (split) | 652, 656 | the target IS a JSX comment in the scanned file |
| `src/lib/knowledge-overview.migration.test.ts` | `rawSql` (split) | 56 | `expect(rawSql).toContain("-- Written idempotently.")` - the target IS a SQL comment, deliberately on the RAW text |
| `src/app/components/accommodations/accommodations.structure.test.ts` | `entry` (split) | 138 | see Section 3.4 |
| `src/app/components/message-replies/useMessageReplies.wiring.test.ts` | `SOURCE` (split) | 84 | see Section 3.4 |
| `src/app/components/recording/discussion-knowledge-context.test.ts` | `body` (split) | 428 | see Section 3.4 |
| `src/app/components/recording/postQuestions.wiring.test.ts` | `src` (split) | 73 | see Section 3.4 |
| `src/app/components/recording/useDiscussionReplies.wiring.test.ts` | `attr` (split) | 128 | see Section 3.4 |
| `src/app/components/tasks/gridColumnModel.test.ts` | `source` (split) | 99 | see Section 3.4 |
| `src/file-size-ceiling.structure.test.ts` | (tracer missed it) | 149 | line ceiling over `countLines(content)`, `:135-136`. Added by hand, see Section 3.3 |

### 3.7 CODE-BEHAVIOUR - the residue, and what "residue" means here

510 subjects / 1307 assertions. These must strip in BOTH directions.

The verdict is a RESIDUE: every one of the 113 files was read at the level of
its `it()` titles and its `readFileSync` targets, and the FILE-CONTENT and
AMBIGUOUS sets above are what that reading produced. **It is not 1307 individual
adjudications and must not be cited as such.** A consumer that needs a specific
assertion's verdict should re-derive it from its own `it()` title.

The highest-value instances, named because a later wave should do these first:

| File | Line(s) | Why it matters |
|---|---|---|
| `src/app/actions/action-guard-coverage.test.ts` | 457, 470, 485, 495, 510, 534, 557, 578, 604, 616, 620, 633, 641 | a SECURITY ratchet: "every OWNER_ONLY action calls requireAppOwner directly". A commented-out `requireAppOwner()` satisfies it |
| `src/lib/grade/grade-result-doors.wiring.test.ts` | (tracer missed; the assertion is inside the per-builder `it()` at `:122-148`) | the one instance the check proved live-armed today |
| `src/lib/use-server-exports.test.ts` | 229, 355 | the export forms that broke a production deploy |
| `src/lib/canvas-pagination-guard.structure.test.ts` | 128, 135, 170 | a same-origin assertion on remote-supplied URLs |
| `src/lib/supabase/impersonation-identity-source.test.ts` | 103 | the pinned `runAsOwner` caller set |
| `src/lib/course-upcoming-dates.test.ts`, `src/lib/upcoming-entry-urgency.test.ts` | 79, 13 | "contains no argument-less `new Date()`" - an absence assertion a comment false-positives |
| `src/lib/workflows/registry/steps.weekly-announcement-schedule.test.ts` | 81 (14 absence assertions) | "never imports `@/lib/supabase/server`" - a server-boundary absence guard |

### 3.8 AMBIGUOUS - reported, not coin-flipped

Seven subjects, 41 assertions. Each is genuinely both, and I would rather hand
over seven honest unknowns than seven confident guesses.

| # | File :: subject | Lines | Why it is ambiguous | What would settle it |
|---|---|---|---|---|
| A1 | `assessment-shared.structure.test.ts :: found` | 62 | "no file in `assessment-shared/` carries per-surface semantics" - a MODULE BOUNDARY rule. A comment discussing `roster` is not semantics, but a boundary rule may legitimately govern the documented contract too | an architect ruling on whether the boundary is about executable coupling or about the module's stated contract |
| A2 | `ModuleDeckCapturePanel.wiring.test.ts :: source` | 95,129,139,180,181,193,280,281,299,300,311,315,327,331 (23) | this file's author DID split the two classes - `sourceWithoutLineComments` exists at `:27` - but left 23 assertions on the raw `source`. Its `it()` titles show both intents, e.g. `never sets saveVideo: true anywhere in this file, including in a comment` (FC) beside `calls start({ saveVideo: false }) at least once, in real code (not just in a comment)` (CB, and satisfied by the raw variable) | reading each of the 23 against its own title - per-assertion work, correctly Wave 2's, not guessable here |
| A3 | `accommodations.structure.test.ts :: PANEL_SOURCE` | 67,69,70,71,72,73,77,78,79,80 | an EXACT-SET `ta-` key scan. A key named only in a comment INFLATES the set and turns the test red; a key whose only live use is commented out DEFLATES it and also turns it red. The direction of failure differs per key | deciding whether the set is "keys the code persists" (CB, strip) or "keys this directory mentions" (FC, do not) |
| A4 | `recording-split.structure.test.ts :: matches` | 198 | same exact-set shape | same as A3 |
| A5 | `module-deck-capture.structure.test.ts :: combined` | 106, 110 | same exact-set shape | same as A3 |
| A6 | `runtime-import-graph.test.ts :: scan` | 310, 313 | the graph is built by `runtime-import-graph.ts`'s own resolver. Whether comments are already excluded is a property of THAT module, not of this test | reading that module's tokenizer. Not done here - it is a production module outside this wave's read budget, and guessing would be worse than saying so |
| A7 | `runtime-import-graph.test.ts :: trails` | 689, 690 | same | same |

A3/A4/A5 are one class wearing three names; whatever settles A3 settles all
three, and that is the cheapest of the seven to close.

### 3.9 The stripper-mechanism meta-tests are excluded by the rule, and the rule is wider than its name

2177 assertions in the 113 gap files have an expect argument that does NOT
trace to a real file read. That population contains every meta-test, because
RULING 72's exclusion is stated as a property of the SUBJECT - "ranges only
over assertions applied to text read from a real file or a real module" - and a
hand-built fixture is not one. No list is needed and none is kept.

**One correction to the rule's NAME, not its content.** The name
"stripper-mechanism meta-test" is narrower than the rule. The same exclusion
covers every PREDICATE canary, which is far more common:
`src/app/components/content-tab/bulkCreateModules.wiring.test.ts:83,92,102,112`
runs `loopGuardsCalleeToCreateEntriesOnly(fixture, "doWrite")` against four
hand-built fixtures; `src/app/components/rubricBreakdownPercent.wiring.test.ts`
asserts `reports false when rubricAreas is only mentioned in a comment`. Both
are excluded by the rule as written. Reading the rule by its NAME instead of its
text would put them back in scope and order the removal of exactly the
instruments that prove a predicate discriminates. The text is right; the label
should be read as illustrative.

---

## 4. Part 2 - the 97 that already strip, audited for the wrong-direction error

### 4.1 What was measured

`l9w1_assert.py` and `l9w1_subjects.py` over the 97:

```
files                                                           97
assertions of every kind                                      3967
  SCANNING                                                    2561
    on a STRIPPED subject                                     2034
    on a RAW subject in the same file                          527
distinct subjects                                              930
files with at least one resolvable subject                      96
```

That 527 raw-subject assertions exist INSIDE stripping files is itself worth
recording: "this file strips" does not mean "this file's assertions are
stripped". `src/lib/recording-files.kinds.test.ts` is the clean example - its
`stripComments` at `:72-73` is applied only to TypeScript sources at `:89`,
while `:44`, `:52` and `:53` assert on raw `.sql` migration text. That is
deliberate and correct, but it means a file-level allowlist entry would be a
lie about 3 of its assertions.

### 4.2 The wrong-direction result: ZERO defects, and the zero discriminates

Detector W (`l9w1_wrongdir2.py`, the twice-rebuilt v3): an assertion whose
EXPECTED value contains a comment opener, measured over comment-blanked text so
a trailing comment cannot supply one.

| | count |
|---|---|
| assertions on a STRIPPED subject whose expected value targets a comment | **0** |
| the same detector, on RAW subjects in the same 97 files | 4 |
| the same detector, over the 113-file gap | 5 |

The 9 non-zero hits were read individually. Eight are the SAME false positive -
a `//` inside an `https://` URL in an expected string
(`current-events-assignments.test.ts:97,205`,
`prompt-announcement-draft.test.ts:416`, `useBulkBarGroups.test.ts:45`,
`walkthrough-announcement.test.ts:360`, `lmsGenerationDiscussion.test.ts:51`,
`useLmsGeneration.test.ts:481,482`). One is real and is the FC instance already
found by hand: `knowledge-overview.migration.test.ts:56`,
`expect(rawSql).toContain("-- Written idempotently.")`.

So the zero is a discriminating zero: the detector fires on three synthetic
controls, on four raw-subject assertions in the audited corpus, and on one real
instance in the sibling corpus - and finds nothing on a stripped subject.

**Bounded claim.** This covers ONE shape of the wrong-direction error: an
assertion that looks FOR a comment while its text has been stripped. It does not
cover a byte/encoding scanner run over stripped text (Section 4.4) or a
non-executable corpus stripped with a JS stripper (Section 4.3). Those two were
hunted separately and are reported below.

### 4.3 The non-TypeScript corpus hunt (detector W3)

A `//` line-comment remover applied to Markdown, CSS, SQL, JSON or YAML is not
comment removal; `https://x` contains `//`. `l9w1_w3.py` flagged 79 of the 97 as
candidates, which is a detector that fires on any file whose header cites a
`docs/*.md` - too loose to be a finding. The candidates whose scanned corpus is
genuinely non-TypeScript were read by hand:

| File | Corpus | Verdict |
|---|---|---|
| `src/lib/recording-files.kinds.test.ts` | `.sql` migrations + `.ts` | CORRECT. The stripper is applied only to the `.ts` read at `:89`; the SQL assertions at `:44,52,53` are raw |
| `src/supabase-migrations.structure.test.ts` | `.sql` | CORRECT, and a naming coincidence worth noting: it is inside the 97 because its SQL-aware `stripCommentsAndDollarQuotes` at `:66` contains the SUBSTRING `stripComments` |
| `src/app/components/repo-grades/repoGradesSliceA.guards.test.ts` | `.css` + `.ts` | CORRECT - it carries `stripCssComments` and `stripJsComments` as separate functions |
| `src/app/components/tasks/taskNoteIndicator.wiring.test.ts` | `.css` | CORRECT - dedicated `stripCssComments` |
| `src/app/components/courses/page-module-css-classes.test.ts` | `.css` + `.ts` | CORRECT - `stripSourceComments` / `withoutComments` |
| `src/app/components/courses/page-module-css-orphan-classes.test.ts` | `.css` + `docs/` | NOT ADJUDICATED. `docs/css-orphans.md` is modified by a live sibling in this session's tree; I read it only and did not evaluate a scanner whose input another agent is changing underneath it. Carried as residual R4 |
| `src/tools/backlog/backlog-file.structure.test.ts` | `.md` + `.yml` | the phantom of Section 2.3. Strips nothing, needs nothing |

No wrong-direction defect. The mechanism is real and unexercised.

### 4.4 The byte/encoding hunt (detector W2)

25 candidates. All 25 were read and adjudicated:

- 12 are code-behaviour false positives whose `it()` title happens to use the
  words "bytes" or "encoding" (`syllabusUploadTransport.wiring.test.ts:42-46,
  90,105-108`, `taskCellAttachments.wiring.test.ts:410,411`, all asserting that
  a component does NOT call `readAsDataURL`/`btoa(`). Correctly stripped;
- 8 are stripper-mechanism meta-tests, excluded by rule
  (`copy-feedback.test.ts:250-253`, `snapshot-grading.structure.test.ts:42-45`,
  both named `strips a trailing // comment on a CRLF-terminated line`);
- 5 are code-behaviour (`copy-feedback.test.ts:313,314`,
  `MessageRepliesPanel.wiring.test.ts:121,124,125`).

No file-content byte scanner runs over stripped text in the 97. **The two real
byte scanners in this repo, `src/lib/no-emojis.test.ts` and
`src/source-bytes.structure.test.ts`, are both in the GAP, both correct there,
and both must stay there.**

### 4.5 What the audit of the 97 did NOT establish

- It did not verify each of the 96 real strippers is behaviourally correct. It
  verified each EXECUTES a stripper and that none looks for a comment on
  stripped text. Section 5 shows behavioural correctness is a separate and
  currently-failing question.
- It did not classify the 930 subjects in the 97 by subject the way Section 3
  classifies the gap. The scope's part 2 asks for confirmation that each is
  "genuinely a code-behaviour scanner stripping correctly, AND flag any that is
  a file-content scanner stripping when it should not". The second half is done
  and is zero. The first half is done only to the extent that the negative
  search found nothing; 930 positive adjudications were not performed. Stated as
  residual R5 rather than implied.

---

## 5. Part 3 - `modalAdoptionScan.ts` and its two dependents

### 5.1 The dependents, confirmed

`grep -rn 'from "./modalAdoptionScan"' src/app/components/ui` returns exactly
two, matching the scope:

- `src/app/components/ui/modalAdoption.wiring.test.ts:47`
- `src/app/components/ui/modalAdoptionWiring.attributes.test.ts:20`

`src/app/components/ui/modalAdoptionScan.ts` is 856 lines
(`(Get-Content).Count`-equivalent: Python `split(chr(10))` length, which counts
the trailing empty string; `wc -l` reports 855).

### 5.2 What they inherit: THE SHARED STRIPPER IS TRAILING-COMMENT-BLIND

This is a live defect, it is not A42, and it was not previously recorded.

```
src/app/components/ui/modalAdoptionScan.ts:146-148

export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}
```

The line-comment half is ANCHORED (`^[ \t]*//`). It removes a whole-line comment
and leaves a TRAILING one untouched. Sliced verbatim out of the real file with
both anchors asserted and executed under `node --experimental-strip-types`
(`mk_l9w1_forms.py` / `l9w1_forms_driver.ts`, exit 0):

```
FORM A (anchored, modalAdoptionScan.ts:147)
  trailing -> "const x = 1; // ungraded rows are handled upstream"
  url      -> "const u = \"https://canvas.example.edu/courses/1\";"
  whole    -> ""
FORM A removes the trailing comment : false
FORM A preserves the URL            : true
```

`stripComments` is called at `:316` inside `classify()`, and every predicate in
the module - `importsMuiDialog`, `importsModalShellComponent`,
`importsUseModalDismissHook`, `adoptsSharedMechanism`, `isDialogSite`,
`hasHookDestructure`, `analyzeHookOnlyAdopterSource` - takes `strippedSource`.
`SITES`, `DIALOG_SITES`, `ADOPTING_PATHS` and `HOOK_DESTRUCTURE_SITES` are all
derived from it. **Both dependent test files therefore inherit a scanner that is
satisfiable by a trailing comment, for every predicate in the module.** That is
L9's own defect, sitting in the one piece of shared machinery the scope's reuse
survey identified as the consolidation target.

### 5.3 The other form in the tree has the OPPOSITE defect

The fourth-idiom file found in Section 2.3 uses the unanchored form:

```
src/app/components/module-deck-capture/ModuleDeckCapturePanel.wiring.test.ts:27-30

const sourceWithoutLineComments = source
  .split("\n")
  .map((line) => line.replace(/\/\/.*$/, ""))
  .join("\n");
```

Same driver, same run:

```
FORM B (unanchored, ModuleDeckCapturePanel.wiring.test.ts:29)
  trailing -> "const x = 1; "
  url      -> "const u = \"https:"
  whole    -> "  "
FORM B removes the trailing comment : true
FORM B preserves the URL            : false
```

**Neither form is correct, and their defects are mutually exclusive.** The
anchored form cannot see a trailing comment; the unanchored form truncates any
line containing `://`. No regex over lines can do both, which is why the
instrument I built for this pass had to become a tokenizer (Section 1.1, R2).

Form B's defect is DORMANT in its own file today:
`ModuleDeckCapturePanel.tsx` contains 0 lines matching `://`
(`mk_l9w1_forms.py`). It is a mechanism, not a live failure, and saying
otherwise would overstate it.

### 5.4 What A42's eventual fix would do to the two dependents

A42 is still `unscoped` with `owns`/`verify`/`blocked_by` all `-`
(`grep -a -n "A42" docs/BACKLOG.md`, line 98, read from the GENERATED file).
This is a statement of the obligation, not a fix.

`modalAdoptionScan.ts:147` contains the `[\s\S]*?\*\/` literal, so the shared
helper IS inside A42's blast radius. Three consequences for the two dependents,
each of which lands on them without any change of their own:

1. **A42's fix changes their verdicts silently.** Whatever A42 does to the
   block-comment half changes `SITES`, `DIALOG_SITES` and `ADOPTING_PATHS` for
   every `.tsx` under `src/app`, and both dependents assert over those exported
   collections. They will go red or green with no diff in their own files. Any
   A42 wave that touches `modalAdoptionScan.ts` must run
   `npm run test:paths -- src/app/components/ui/modalAdoption.wiring.test.ts src/app/components/ui/modalAdoptionWiring.attributes.test.ts`
   in the same commit, and its write set must name both, per the repo's own
   "an assignment must include the file that CALLS the new export" rule.
2. **A42 will not fix the trailing-comment half.** A42's subject is the
   MIME-wildcard false block-comment open in the `[\s\S]*?\*\/` family. The
   anchored `^[ \t]*//` is a different half of the same line and a different
   defect. Fixing A42 leaves Section 5.2 intact, and closing A42 must not be
   read as closing this.
3. **A frozen oracle is required before either change.** The correct instrument
   is the one `docs/loop/traps-tests.md` already names: capture
   `ADOPTING_PATHS` and `HOOK_DESTRUCTURE_SITES` as frozen literals BEFORE the
   change and compare after, so a migration that alters a stripping decision is
   caught. A self-comparison after consolidation would be a tautology.

### 5.5 One more thing the dependents inherit, and it is an instrument defect

`src/lib/grade/grade-result-doors.wiring.test.ts:85-86` carries what looks like
a comment-awareness control:

```
expect(callsBuilder("// no mention of any builder here", "postCanvasGradesAction")).toBe(false);
expect(referencesUngradedFlag("// nothing relevant in this file at all")).toBe(false);
```

Both strings carry a comment marker and NO target token, so they return false
whether the predicate is comment-aware or comment-blind. Proven by running the
two predicates verbatim, sliced with both anchors asserted, alongside a
comment-aware variant built from `modalAdoptionScan`'s own `stripComments`
(`mk_l9w1_canary.py` / `l9w1_canary_driver.ts`, node exit 0):

```
(1) the file's OWN canary string "// nothing relevant in this file at all"
  blind = false   aware = false   DISCRIMINATES: false
(2) a whole-line comment that DOES carry the token
  blind = true    aware = false   DISCRIMINATES: true
(3) a TRAILING comment carrying the token, through the SHARED stripper
  stripComments(...) = "const x = 1; // ungraded rows are handled upstream"
  blind = true    aware = true    DISCRIMINATES: false
(4) control, real live code: blind = true, aware = true
```

Line (1) is the "canary using a nonsense string" shape: it reads as coverage of
the comment question and covers nothing. Line (3) is Section 5.2 again, executed
end to end - the shared stripper does not make the aware variant differ from the
blind one for a trailing comment. **Any Wave 2b fix that adopts
`modalAdoptionScan.stripComments` as its stripping call inherits (3) and closes
only half the defect it claims to close.**

---

## 6. The allowlist a later ratchet will need - CONSTRUCTED, NOT FROZEN

RULING 74 blocks Wave 3 until this classification exists. It exists now, and the
freezing step is still Wave 3's. What follows is the CONSTRUCTION - how the set
is built and why it is buildable from the tree - not the set itself.

### 6.1 Why the obvious allowlist would be wrong

An allowlist of "gap files with an undefended presence assertion", seeded from
the census, would be wrong in five measured ways at once:

| # | Defect | Size |
|---|---|---|
| 1 | it credits a file with no defence as defended (the phantom) | 1 file |
| 2 | it marks as undefended a file that strips under a fourth name | 2 files |
| 3 | it marks as undefended a file whose defence is an AST parse | 2 gap files |
| 4 | it marks as undefended a file whose predicate is canaried against comments | 12 gap files |
| 5 | it cannot see boolean- and other-shaped scanning assertions at all | 635 assertions |

### 6.2 The construction

An entry is a (file, subject, class) triple, not a file. Build it in this order,
every step already executed once in this pass so the construction is proven
possible from the tree:

1. **Population.** Walk `src/` for `*.test.ts` containing `readFileSync`.
   Instrument: `l9w1_census.py`. Today: 210. Canary: a nonexistent token returns
   0 on the same walk.
2. **Subtract the defended.** A file is defended when it executes a stripping
   mechanism, where "executes" is decided with the TOKENIZER
   (`l9w1_phantom2.py`), never with a raw substring search, and "a stripping
   mechanism" includes the three named idioms plus any `.replace(` or named
   function that removes `//`, `/* */` or `--`. Today: 98, not 97.
3. **Subtract the otherwise-defended.** M-AST and M-CANARY from
   `l9w1_mechanisms.py`. The 2 AST files:
   `classTrendsFolderEntry.test.ts`, `repoGradesClassTrends.wiring.test.ts`. The
   12 canary files: `walkthrough-announcement.test.ts`,
   `FabQuickActionsMenu.wiring.test.ts`,
   `accommodations.structure.test.ts`, `useMessageReplies.wiring.test.ts`,
   `ModuleDeckCapturePanel.wiring.test.ts`,
   `module-deck-capture.structure.test.ts`,
   `repoGradesSliceB.guards.test.ts`, `rubricBreakdownPercent.wiring.test.ts`,
   `canvas-client-boundary.test.ts`, `cron-heartbeat.test.ts`,
   `no-emojis.test.ts`, `session-diagnostic-log.test.ts`.
4. **Subtract the FILE-CONTENT subjects** - Section 3.6. These are not debt;
   they are correct and must never enter the allowlist, or a later cleanup will
   "fix" them into permanent red.
5. **Hold out the AMBIGUOUS subjects** - Section 3.8. Seven subjects that belong
   in neither column until settled. An allowlist that assigns them is a guess
   wearing a ratchet's clothes.
6. **Enumerate the remainder per assertion, with the boolean shapes included.**
   Instrument: `l9w1_assert.py`, which resolves `.toBe(...)` on a
   boolean-returning scan function as well as `.toContain`/`.toMatch`. Its known
   miss is Section 3.3's Map-valued sources, and that miss must be closed BEFORE
   freezing, because it currently drops the single most load-bearing file in the
   population.

### 6.3 The direction-of-failure the ratchet must assert

Object: the set of (file, subject) pairs in the gap carrying at least one
CODE-BEHAVIOUR scanning assertion and no defence mechanism.
Instrument: steps 1 to 6 above, re-run at test time.
Direction: RED when the set gains an entry not in the frozen list, and RED when
a frozen entry is no longer found (so a fixed file must drop its entry in the
same commit). `src/tools/vitest-paths/gate-commands.structure.test.ts:367`
already implements exactly this bidirectional shape and is the model to copy.

### 6.4 The three things this allowlist cannot do, which is why Wave 4 stays load-bearing

- It is a NAME-level census. A file whose stripper runs but is behaviourally
  wrong - Section 5.2's is the proof that these exist - counts as defended.
- It cannot see M-SLICE (110 files) or a hand-written comment-aware predicate as
  a defence, so it will demand changes to files that need none. Every such entry
  must be adjudicated on entry, not suppressed later.
- It cannot detect a SPLIT subject (Section 3.4). A variable carrying both
  classes looks like one entry and needs two.

---

## 7. Executable here versus argued

Stated separately because this environment blocks the network, renders no
component, and has no API keys.

**EXECUTED in this pass (a command ran and its exit code was read directly):**

- the census, the gap, the two populations, the phantom count, the fourth-idiom
  count, the mechanism census, the assertion and subject extraction, the split
  count, and all three wrong-direction detectors, each with its controls;
- the two stripper forms run verbatim against trailing comments, URLs and
  whole-line comments (`node --experimental-strip-types`, exit 0);
- `referencesUngradedFlag` and `callsBuilder` run verbatim against the flagship
  file's own canary string, a real comment, and a trailing comment (exit 0);
- the two structural gates plus the gate-commands test (Section 9).

**ARGUED, not verified - labelled as argued everywhere it is used:**

- that adding stripping to `panelSource` turns `:652`/`:656` red. The mechanism
  is certain (the target is inside `{/* ... */}`, which the block-comment
  stripper removes) but no test was mutated, because this wave mutates nothing.
  The cheapest proof is the sabotage protocol in `docs/l9-scope.md` Section 6,
  run by Wave 4;
- that A42's fix changes the two dependents' verdicts. A42 has no fix to run
  against;
- the CODE-BEHAVIOUR residue verdict for 1307 assertions, which is a
  file-level reading applied downward, not 1307 adjudications (Section 3.7);
- that the 96 real strippers are behaviourally correct. Only the negative search
  was run (Section 4.5).

**CANNOT BE DETERMINED IN THIS ENVIRONMENT:**

- whether any of these tests would behave differently against a rendered
  component. vitest is node-env and collects only `src/**/*.test.ts`; nothing
  here renders. Every finding above is a reading claim about source text;
- whether a currently-live block-commented import of `@/lib/canvas` or
  `@/lib/canvas-modules` exists in a sibling's in-flight branch. Only this
  working tree was read.

---

## 8. Residual register

Every row carries an owner, an instrument and a step. A row missing any of the
three is a deletion and is not written.

| # | What is not settled | Owner | Instrument | Object / direction of failure | Step |
|---|---|---|---|---|---|
| R1-B | The subject tracer follows `const X = ...` only, and misses sources held in a `Map` or a loop-local. 3 of 113 gap files, including `grade-result-doors.wiring.test.ts` (the one proven live-armed instance) and `file-size-ceiling.structure.test.ts` | `loop-test-author`, before Wave 3 freezes anything | Extend `l9w1_assert.py` to follow `Map.set`/`Map.get` and loop-local bindings, then re-run and diff the subject count against 574 | The gap's scanning-assertion set; a missed subject is silently absent from the allowlist forever | Before Wave 3's freeze, per Section 6.2 step 6 |
| R3-B | A FIFTH stripping idiom under a fifth name. R3 is discharged positive (2 found) but not closed | `loop-test-author`'s Wave 2 | The `R3-NAMED` scan of `l9w1_r3b.py`, widened to any function whose body contains a `.replace(` or `.split(` removing a comment token in ANY language, run over all 210. Its canary is the 56 occurrences it already finds in the 97 | POP_A; a hidden idiom is misclassified as undefended (churn) or as defended (a real gap hidden) | Wave 2's first step |
| R3-SQL | The `R3-SQL` detector in `l9w1_r3b.py` returned 0 with NO positive control. Its zero is not evidence | Same as R3-B | Build a positive control from `src/supabase-migrations.structure.test.ts:66` (`stripCommentsAndDollarQuotes`) and re-run; a detector that cannot find that one is broken | The SQL-corpus subset; a zero read as a finding is the exact class this seat exists to prevent | Same step as R3-B |
| R4 | `src/app/components/courses/page-module-css-orphan-classes.test.ts` was not adjudicated: it reads `docs/`, and `docs/css-orphans.md` is being modified by a live sibling in this tree | The orchestrator, once the sibling's `docs/css-orphans.md` work has committed | Re-run `l9w1_w3.py`'s hand-adjudication step on that one file against a settled tree | A stripping file over a `docs/` corpus; a JS stripper over Markdown truncates any line containing `://` (Section 5.3 proves the mechanism) | The first wave after the css-orphans sibling commits |
| R5 | The 930 subjects in the 97 were not positively classified by subject. Only the NEGATIVE search (a file-content scanner that strips) was run, and it is zero | `loop-test-author`'s Wave 2a | Run Section 3's per-subject reading over the 97 the same way it was run over the 113 | The 97; a code-behaviour scanner stripping the WRONG text is invisible to the negative search that was run | Wave 2a, before it sizes its own write set |
| R6 | The 7 AMBIGUOUS subjects (Section 3.8). A3/A4/A5 are one question; A6/A7 are one question; A1 and A2 are their own | A1: `loop-architect`. A2: Wave 2's per-assertion pass. A3/A4/A5: `loop-architect`. A6/A7: whoever reads `src/lib/module-graph/runtime-import-graph.ts` | Section 3.8's "what would settle it" column, per row | 41 assertions; a coin-flip here puts a correct file-content scanner into the fix list, or leaves a real gap out of it | A1/A3-A5 at the next architecture pass; A2 inside Wave 2; A6/A7 whenever that module is next read |
| R7 | `modalAdoptionScan.ts:147`'s trailing-comment blindness (Section 5.2) has no owner. It is NOT A42 (different half of the line, different defect) and NOT currently in any wave's write set | UNASSIGNED - this needs an orchestrator ruling, and saying otherwise would fabricate an owner the way `docs/l9-check.md` M1 records | Replace the two-regex stripper with the tokenizer proven in `l9w1_phantom2.py` (7/7 controls), then compare `ADOPTING_PATHS` and `HOOK_DESTRUCTURE_SITES` against a frozen literal captured before the change | `modalAdoptionScan.ts` plus its 2 dependents; every predicate in the module is satisfiable by a trailing comment today | An orchestrator ruling on whether this becomes its own row, joins A42, or joins L9's Wave 2a |
| R8 | RULING 72's exclusion is named "stripper-mechanism meta-test" but its TEXT covers every predicate canary (Section 3.9). The name is narrower than the rule | The orchestrator, at the next restatement of RULING 72 | Re-read the rule's text, which is already correct; the change is to the label only | The exclusion set; reading the rule by its name puts predicate canaries back in scope and orders their removal | The next document that restates RULING 72 |
| R9 | `docs/backlog.yml`'s L9 note still states the pre-RULING-72 binary framing. Inherited unchanged from `docs/l9-scope.md` R8, and outside this pass's write set | Whichever agent next edits `docs/backlog.yml` | Update the note's triage-rule sentence to the subject-based rule, then `npm run backlog:render` | `docs/backlog.yml`'s L9 entry; a later wave designs against the row's stale prose | The next backlog reconciliation touching that row |

---

## 9. Gate check for this pass

This pass wrote documentation only. Both byte gates scan `docs/`
(`src/lib/no-emojis.test.ts:237,254` walks `["src", "docs"]` with `.md` in
`SCAN_EXTENSIONS`; `src/source-bytes.structure.test.ts` walks `process.cwd()`
with `.md` in its extension set), and
`src/tools/vitest-paths/gate-commands.structure.test.ts` pins raw multi-path
`vitest` occurrences inside `docs/**/*.md` against a frozen set - so this file
is inside all three gates' populations and re-running them is the evidence.

Run after writing this file, exit code read directly from the command:

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts
```

```
Test Files  3 passed (3)
      Tests  49 passed (49)
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/tools/vitest-paths/gate-commands.structure.test.ts files=1 passed=28
EXITCODE:0
```

Byte check, read as BYTES in Python rather than with `grep -c $'\r'`, which
false-positives in this checkout:

```
bytes        : 54473
CR bytes     : 0
LF bytes     : 880
CRLF pairs   : 0
BOM at start : False
NUL bytes    : 0
non-ASCII    : 0
lines by LF  : 881
```

`git status --short` after writing this file:

```
 M docs/css-orphans.md
?? docs/l9-wave1-classification.md
```

`docs/l9-wave1-classification.md` is this pass's own entry and the only file it
wrote (`??`, because it is new). `docs/css-orphans.md` is sibling-owned, was
read only, and is unchanged from this pass's start. `docs/g4-scope.md` was `M`
at this pass's start and its owner has since committed it. No `git stash`, no
`git add -A`, and no `git checkout --` was run at any point, and
`docs/backlog.yml` was never opened - every backlog row cited above was read
from the generated `docs/BACKLOG.md` with `grep -a`.

The byte counts above were taken BEFORE this closing section was appended, so
the file is longer now; the properties they assert (no CR, no BOM, no NUL, no
non-ASCII) were re-checked after the append and still hold.
