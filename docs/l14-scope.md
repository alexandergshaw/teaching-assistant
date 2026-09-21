# L14 scope - a multi-path vitest gate that silently covers less than it names

Seat: architecture (`loop-architect`). **Revision 1 of a cap of 2**, answering
the round-0 check (2 blockers, 2 majors, 5 minors; the checker ruled that none
of them changes the shape - wrapper plus JSON reporter, one wave, the layers,
the write set). Round 0 is commit `7bda6ca`. Date: 2026-09-21. Tree: `main` at
`0b96cab`, vitest 4.1.9 (`npx vitest --version` prints
`vitest/4.1.9 win32-x64 node-v22.14.0`).

Inputs read: `docs/DEV_LOOP.md`, `docs/loop/seats.md` (triage, Architect +
reuse survey), `docs/loop/leverage.md`, `docs/loop/this-repo.md`,
`docs/loop/traps-spec.md`, `docs/loop/traps-search.md`,
`docs/loop/traps-tests.md`, and the L14 and L15 rows of `docs/backlog.yml`
(`python -c "import yaml,io; d={r['id']:r for r in yaml.safe_load(io.open('docs/backlog.yml',encoding='utf-8'))}; print(d['L14'])"`,
and the same for `L15`).

This document decides SHAPE and writes no production code. Every quantity names
the command that produced it; where a command ran through a shell helper, the
helper is shown. Revision-1 prototypes live in the session scratchpad under
`arch-l14/` (my own subdirectory; the checker's files sit at the scratchpad
root and are not used here).

---

## R. What revision 1 changed (read this before the body)

| Finding | Ruling | Where it landed |
|---|---|---|
| **B1** coverage credited by vitest's substring rule, so an argument naming no tests passes | ACCEPTED, measured on the real tree (the five paths below) | 3.2 step 6 rewritten; P6 gains the five rows; X10 |
| **B2** the detector recognised one spelling | ACCEPTED; every spelling re-measured (1.7) | 5.2 detector rewritten; 40-case canary table; S7 reads argv arrays |
| **M1** S6 ignored the wrapper, so a two-path wrapper `verify` passed | ACCEPTED | S6 now counts path arguments on every test command, wrapper included; X11 |
| **M2** routing skipped `loop-architect`, `loop-ac`, `loop-top`, and only 2 of 7 routing edits were pinned | ACCEPTED; confirmed from the file headers (`a22-scope.md:1` "Architecture seat", `a23-criteria.md:2` and `a18-ac.md:2` "`loop-ac`") | 5.1 routes all eight agent definitions; P11 pins all ten routing files; X15 |
| **m1** S8 was a count ratchet | ACCEPTED | S8 is a frozen SET of hits (file plus normalised command), exact in both directions |
| **m2** L15 obligations had no pass condition; P2/P3 nested a whole-tree walker | ACCEPTED | P13 and X12/X13; P1-P3 use `src/tools/backlog/ids.test.ts` and `areas.test.ts` |
| **m3** P7 banned only two exact spellings | ACCEPTED | P7: every element starting with `-` contains `=` |
| **m4** P4 in the wrong file; no row for a signal-killed child | ACCEPTED | new `cli.test.ts` in the write set owns P4 and P12 |
| **m5** five legitimate lines false-fired | ACCEPTED | all five are must-not-fire canary rows, passing |
| Round-0 section 13 open question: why PowerShell loses `-t` | SETTLED by the checker; my own Bash measurement adds that npm swallows flags in BOTH shells (1.5) | 1.5, and the `traps-tests.md` entry says what actually protects the run |

**Disposition of round-0 identifiers** - derived LAST, after every renumbering
decision below. Revision 1 renumbers nothing: every round-0 id keeps its number
and its object; new obligations take new numbers.

| Round-0 id | Revision-1 disposition |
|---|---|
| P1, P2, P3 | KEPT, same ids; the light file `src/tools/backlog/ids.test.ts` replaces `src/lib/no-emojis.test.ts` (m2) |
| P4 | KEPT as P4; moved from `paths-gate.test.ts` to `cli.test.ts` (m4) |
| P5, P8 | KEPT unchanged |
| P6 | KEPT as P6; the rule under test CHANGED (B1) and the five test-less paths are added as must-be-NOT-COVERED rows |
| P7 | KEPT as P7; strengthened (m3) |
| P9 | KEPT as P9; 19 canary cases become 40 (B2, m5) |
| P10 | KEPT as P10; S6, S7 and S8 changed (B2, M1, m1) |
| P11 | KEPT as P11; 2 pinned files become 10 plus `package.json` (M2) |
| - | NEW P12 (signal-killed child, m4), NEW P13 (L15 obligations, m2) |
| X1-X9 | KEPT; X5-X7 unchanged in intent; X9 now also exercises the wrapper spelling |
| - | NEW X10-X15 |
| S1-S8 | KEPT as scope ids; S6, S7, S8 rules changed |
| R1-R10 | KEPT; R2, R3, R5, R6, R7 re-worded to revision 1 |
| - | NEW R11: the L14 row's filed residual text (commit `0b96cab`) now lags R2/R3/R5/R6/R7 |

Nothing is withdrawn, so no enforcer loses its requirement.

---

## 0. The answer in five lines

1. **Reproduced on today's tree**, wider than the row says: a missing path, a
   missing path next to a directory, a quoted glob, a typo, an existing `.tsx`,
   and an existing file outside `src/` are all dropped silently, exit 0,
   whenever one other argument matches - and the same is true of EVERY spelling
   that reaches `vitest run`: `npm test a b`, `npm test -- a b`,
   `npm run test -- a b`, `npx vitest a b`, `npx vitest --run a b` (1.1, 1.7).
2. **No vitest option fixes it.** The drop is `filterFiles`'s `.some()` union
   (1.3).
3. **The normative layer has zero raw multi-path invocations; the live callers
   are per-item design documents and the orchestrator's off-tree briefs** (2).
4. **Fix: a paths-only wrapper, `npm run test:paths <p1> <p2> ...`,** that runs
   ONE vitest process with the JSON reporter, lets vitest's substring rule
   choose what RUNS, and credits each argument ONLY with executed files EQUAL to
   its path or INSIDE it when it is a directory - each argument must be credited
   at least one file with at least one passing assertion (3).
5. **The surface is a layer, delivered in the same wave**: `this-repo.md`,
   `traps-tests.md` and all eight agent definitions name the script, and a
   structure test holds raw multi-path test commands (every spelling, argv
   arrays included) at zero in the gate definitions, counts the wrapper too in a
   backlog `verify`, and freezes the exact set of existing hits in
   `docs/**/*.md` (5).

---

## 1. Reproduction

### 1.1 The matrix

Run from the Bash tool, which passes argv exactly. The helper, verbatim:

```
run(){ n=$1; shift; npx vitest run "$@" > "$S/$n.txt" 2>&1; e=$?; echo "$n EXIT=$e :: $(tr -d '\000' < "$S/$n.txt" | grep -aE 'Test Files|Tests  |No test files|Error' | tr '\n' '|')"; }
```

(`$S` is the session scratchpad; `tr -d '\000'` because vitest output carries
NUL bytes, `traps-search.md` last entry.)

| Case | Arguments after `run <name>` | Exit | Output |
|---|---|---|---|
| c1 | `src/lib/no-emojis.test.ts src/does-not-exist.test.ts` | **0** | `Test Files 1 passed (1)`, `Tests 18 passed (18)` |
| c2 | `src/does-not-exist.test.ts` | 1 | `No test files found, exiting with code 1` |
| c3 | `src/does-not-exist.test.ts src/also-missing.test.ts` | 1 | `No test files found` |
| c4 | `src/no-such-dir/` | 1 | `No test files found` |
| c4b | `src/tools/backlog/` | 0 | `Test Files 13 passed (13)`, `Tests 102 passed (102)` |
| c5 | `src/tools/backlog/ src/does-not-exist.test.ts` | **0** | `Test Files 13 passed (13)` - the missing path vanished |
| c6 | `'src/tools/backlog/*.test.ts'` (quoted glob) | 1 | `No test files found` - vitest filters are not globs |
| c7 | `'src/nope/*.test.ts' src/lib/no-emojis.test.ts` | **0** | `Test Files 1 passed (1)` |
| c8 | `no-emojis` (bare substring) | 0 | `Test Files 1 passed (1)` - a filter is a substring match |
| c9 | `src/lib/no-emojis.test.ts src/lib/no-emoji.test.ts` (typo) | **0** | `Test Files 1 passed (1)` |
| c10 | `src/lib/no-emojis.test.ts src/lib/no-emojis.test.tsx` | **0** | `Test Files 1 passed (1)` |
| c11 | `src/lib/no-emojis.test.ts docs/DEV_LOOP.md` (exists, not collected) | **0** | `Test Files 1 passed (1)` |

The row's measurement (c1) reproduces exactly. It also reproduces from
PowerShell typed literally: `npx vitest run src/lib/no-emojis.test.ts src/does-not-exist.test.ts`
piped to `Select-String` printed the same two lines and `$LASTEXITCODE` was 0.

**The bold rows are the defect: every multi-argument case in which one argument
matches drops the others, whatever their shape.** A single argument is always
loud (c2, c4, c6). c11 matters for the design: the dropped path EXISTS, so a
wrapper that only checks existence passes it.

**Instrument I discarded.** A first matrix from PowerShell, passing each case as
`& npx vitest run @($c.a)` from a hashtable, returned exit 1 and
`No test files found` for c1, c5, c7 and c9 - disagreeing with the literal
PowerShell run and the Bash matrix. I did not isolate why. The Bash matrix and
the literal PowerShell run agree, so they are the evidence.

### 1.2 Directory and glob

- **Directory:** alone, a real directory runs its files (c4b) and a missing one
  fails loudly (c4). Next to a missing path, the missing path is dropped (c5).
  vitest's match is a SUBSTRING: `src/tools/backlog` without a slash would also
  select a sibling `src/tools/backlog-foo/`. **That over-match is safe for
  CHOOSING WHAT RUNS and unsafe for DECIDING COVERAGE** - round 0 called it "the
  safe direction" and was wrong for coverage (B1, section 3.2 step 6).
- **Glob:** vitest does not expand globs. A quoted glob alone fails loudly (c6);
  next to a real path it is dropped (c7). Bash expands an unquoted glob before
  vitest sees it; PowerShell never does. I did not measure the unquoted Bash
  case.

### 1.3 Why, from vitest's own source, and why no option fixes it

`node_modules/vitest/dist/chunks/cli-api.24X8XwN1.js:10860-10871`,
`filterFiles(testFiles, filters, dir)`, opened: it keeps every collected test
file for which `filters.some(...)` matches, a match being
`testFile.includes(f.toLocaleLowerCase()) || testFile.includes(relativePath.toLocaleLowerCase())`
on the lower-cased root-relative path. The filters are a UNION with no
per-filter accounting. `globTestFiles` calls it at `:10779`. The only empty
check is on the union, `printNoTestFound` at `:1965-1969`.

**No CLI or config option makes a filter strict.** `npx vitest run --help` lists
65 options (`npx vitest run --help 2>&1 | tr -d '\000' | grep -ac "^  -\|^  --"`);
`grep -aiE "strict|exact|error.*filter|filter.*error|unmatched|must match"` over
it returns one line, `--strictTags`, which is about tags (and is the canary that
the grep can match that output). `passWithNoTests` governs only the empty union.
`ls node_modules/vitest` shows no docs directory.

### 1.4 What the JSON reporter measures - `numTotalTestSuites` is NOT a file count

One run, three arguments, one missing - written here WITHOUT the command line
itself, because its paths are real repo paths and a copy-paste of a reporter
command next to real paths is the 1.6 hazard: arguments
`src/lib/no-emojis.test.ts`, `src/tools/backlog/` and
`src/does-not-exist.test.ts`, with `--reporter=default --reporter=json` and a
joined `--outputFile.json=` pointing into the scratchpad. It exited 0 with
`Test Files 14 passed (14)`; the report read with
`node -e "const j=require(process.argv[1]); console.log(j.testResults.length, j.numTotalTestSuites, j.numTotalTests)"`
gave **`testResults.length` 14, `numTotalTestSuites` 34, `numTotalTests` 120.**
`numTotalTestSuites` counts suites, never compare it to a path count;
`testResults.length` is the file count. Each `testResults[i]` carries `name`
(absolute, forward slashes), `status`, and `assertionResults[]` with `status`.
The missing path appears nowhere in the report.

### 1.5 The flag problem through npm - both shells, and what actually protects the run

Measured by me, Bash, npm 10.9.2, light file `src/tools/backlog/ids.test.ts`:

| Typed | npm echoed | Result |
|---|---|---|
| `npm test src/tools/backlog/ids.test.ts -t zzNoSuch` | `> vitest run src/tools/backlog/ids.test.ts zzNoSuch` | 4 passed - npm swallowed `-t`, its value arrived as a PATH filter and was dropped |
| `npm test src/tools/backlog/ids.test.ts --reporter=verbose` | `> vitest run src/tools/backlog/ids.test.ts` | npm swallowed the flag entirely |
| `npm test -- src/lib/no-emojis.test.ts -t zzNoSuchzz` (Bash) | `> vitest run src/lib/no-emojis.test.ts -t zzNoSuchzz` | `Tests 18 skipped (18)` - with `--`, Bash delivers the flag |
| the same from PowerShell (round 0) | `> vitest run src/lib/no-emojis.test.ts zzNoSuchzz` | 18 passed - the flag was lost |

**Mechanism, from the round-0 checker** (I did not re-measure it): `npm`
resolves to `npm.ps1` in PowerShell, and PowerShell strips a bare `--` when
calling a `.ps1` script; quoting `'--'` or calling `npm.cmd` preserves it. The
checker also reports npm swallowing `--json`, `--outputFile` and
`--testNamePattern=` without `--`, in both shells.

**Consequence for the wrapper, stated honestly:** through `npm run test:paths`
the refuse-any-flag rule almost never fires, because npm eats the flag before
the wrapper sees it. Safety holds for two other reasons: a flag's displaced
VALUE arrives as a positional and fails the existence check (w7 in 3.4), and a
flag npm swallows whole only makes a run BROADER. The refusal still fires on the
direct `node ... cli.ts` form. The `traps-tests.md` entry must say exactly this,
and must not claim the wrapper refuses flags.

### 1.6 The incident this measurement caused

While measuring `vitest list`, I ran a `vitest list --filesOnly --json` command
with `src/lib/no-emojis.test.ts` as the next argument. **`--json` takes an
OPTIONAL path, so vitest consumed that test file as the JSON output path and
overwrote it with the two bytes `[]`** (`od -c` printed `[   ]`; `git diff --stat
HEAD` showed 302 deletions). It was unmodified at session start, so
`git checkout --` restored it (302 lines, 18 of 18 passing afterwards). The
orchestrator's disposition: identical to HEAD, 18/18, and A16 wave 3 committed at
08:51, after the restore, having re-run its gates - nothing shipped on a false
result. The round-0 checker then built the wrapper from 3.2 in a sandbox and
found the incident cannot recur through it: every flag in `=` form, hostile
inputs (`--json src/a.test.ts`, `--outputFile <testfile>`, a bare `run`) refused
before vitest starts, a path containing `=` handled as a path, every sandbox
file's sha1 unchanged, no report left behind.

**Design input:** a flag with an optional value swallows the next positional,
and the victim can be a test file. Hence joined `--flag=value` only, and a
report path outside the repository (P7).

### 1.7 Every spelling that reaches `vitest run` drops silently (B2)

Measured with a helper that feeds `/dev/null` as stdin (so vitest has no
terminal) and prints npm's echo and the summary:

```
r(){ n=$1; shift; out=$("$@" < /dev/null 2>&1 | tr -d '\000'); echo "$n :: $(echo "$out" | grep -aE '^> |Test Files|Tests  |No test files|FAIL' | tr -s ' ' | tr '\n' '|')"; }
```

With `A=src/tools/backlog/ids.test.ts` and `M=src/does-not-exist.test.ts`:

| Spelling | Result |
|---|---|
| `npx vitest $A $M` (no subcommand) | `Test Files 1 passed (1)`, `Tests 4 passed (4)` - with no terminal, bare `vitest` runs once |
| `npx vitest --run $A $M` | same |
| `npm test $A $M` | echo `> vitest run <A> <M>`, then `Test Files 1 passed (1)` |
| `npm test -- $A $M` | same |
| `npm run test -- $A $M` | same |

`package.json:10` is `"test": "vitest run"`, and `"test:watch": "vitest"`; the
set of npm scripts whose value starts with `vitest` is `test, test:watch`
(census script `arch-l14/census3.mjs`, which reads it from `package.json`).

---

## 2. Caller census

### 2.1 Instrument

`arch-l14/detect2.mjs` in the scratchpad, revision 1. It finds three command
FAMILIES:

- **vitest** - `vitest` (optionally after `npx`, `pnpm`, `yarn`) followed by an
  optional subcommand (`run`, `watch`, `dev`, `related`, `bench`, `list`), or by
  `--run`, or directly by a path. A following word that is none of those
  (`vitest runs ...`) is prose and is not a command.
- **npm-vitest** - `npm t`, `npm test`, `npm run <s>`, `npm run-script <s>`
  where `<s>` is a script whose value starts with `vitest`, read from
  `package.json`; an optional `--` is skipped.
- **wrapper** - `npm run test:paths`, or a path ending `vitest-paths/cli.ts`.

Arguments are scanned token by token: `--flag=value` is one token; a flag in
the value-taking set (`-t`, `--testNamePattern`, `--reporter`, `--outputFile`,
`--project`, `--dir`, `--root`, `-r`, `--config`, `-c`, `--testTimeout`,
`--pool`, `--shard`, `--bail`, `--exclude`, `--workspace`, `--environment`,
`--maxWorkers`, `--minWorkers`, `--retry`, `--mode`) consumes the next token; a
quoted token is one token (and a quoted token starting with `-` is a flag); a
PATH-SHAPED token (contains `/` other than only slashes, contains a backslash
other than a lone continuation one, or ends `.test.ts`/`.test.tsx`) counts.
**The scan STOPS at the first token that is none of these** - that is what keeps
prose after a command, and multi-word unquoted `-t` names, from counting. It
also stops at an unquoted backtick, `|`, `;`, `&`, `<`, `>`, `)`, `]`, `,`.

Logical lines are built before scanning: shell (` \`) and PowerShell (` ` plus
backtick) continuations join; a YAML block scalar (`key: >`, `key: |`, with
optional chomping) joins its more-indented body; an open inline code span
joins following lines (stripping a leading `//`, `*`, `#` or `>`); and a line
holding a command joins following MORE-indented lines made only of arguments,
which covers a fenced command whose paths sit on the next lines.

For source files (S7), `callCommands` takes every `spawn`, `spawnSync`, `exec`,
`execSync`, `execFile`, `execFileSync` and `fork` call, collects the string
literals inside its parentheses in order, joins them with spaces, and scans the
result - so `spawnSync("npx", ["vitest", "run", "a", "b"])` is seen as the
command it is.

**Canary: 40 cases, 0 failures** (`node arch-l14/canary2.mjs`, last line
`cases 40 failures 0`). **And the table can fail:** a copy whose 16 must-fire
expectations are flipped to 0 prints `failures 16`. The cases:

- MUST FIRE (16): the c1 repro; directory plus file; shell continuation; flags
  between paths; `.../` elided paths; a wrapped inline span; two quoted paths;
  `npm test a b`; `npm test -- a b`; `npm run test -- a b`; `npm t a b`;
  `npx vitest a b`; `npx vitest --run a b`; a YAML folded scalar
  (`run: >` then the command and two paths on indented lines); a fenced command
  with its paths on the following lines; a PowerShell backtick continuation.
- WRAPPER, counted in its own family (2): `npm run test:paths a b` is one
  wrapper multi-path hit and zero raw hits; a single-path wrapper is zero.
- MUST NOT FIRE (17): a single path; single path with `-t "a/b c/d"`; an
  UNQUOTED multi-word `-t renders the a/b table`; prose after a command with no
  backticks (`ran npx vitest run src/a.test.ts and then src/b.test.ts was read
  by hand`); a `--exclude` value; a `--workspace` value; "vitest run times grow
  with src/lib/ and src/app/"; "vitest runs in the node environment with src/a
  and src/b"; "a multi-path `vitest run` silently drops ..."; `<WS-2>`
  placeholders; two single-path runs on one line; a bare `npx vitest run`;
  "`npx vitest run` over both guard files"; a single path inside a `//`-wrapped
  comment span; a quoted `"--outputFile.json=a/b.json"`; a fenced single path;
  "Capture `npm test` totals".
- ARGV SPAWNS (5): `spawnSync("npx", ["vitest","run","src/a.test.ts","src/b.test.ts"])`
  fires; `execSync("npx vitest run src/a.test.ts src/b.test.ts")` fires; a
  single-path argv spawn, an argv spawn of the wrapper, and
  `spawnSync(process.execPath, [vitestBin, ...argv])` (no literals) do not.

### 2.2 Result per place

`node arch-l14/census3.mjs` from the repo root:

| Place | Raw multi-path test commands | Canary for the absence |
|---|---|---|
| S1-S3, S5: `.claude/agents/*.md`, `docs/DEV_LOOP.md`, `docs/loop/*.md`, `AGENTS.md`, `CLAUDE.md`, `.github/workflows/*` (24 files) | **0** | the same detector finds 16 hits in S8, and the 40-case table |
| S4: `package.json` script values | **0** | as above |
| S7: `src/` files importing `node:child_process` - one, `src/tools/backlog/closure-runner.ts` | **0** (text and argv) | the argv canary rows |
| S6: `verify` fields in `docs/backlog.yml` | **0** - 43 rows, all `verify: null` (`grep -c "^  verify: " docs/backlog.yml` = 43, all `null`) | - |
| every `src/**` `.ts`/`.tsx` as text (reference, not a scope) | **0** | - |
| S8: `docs/**/*.md` except `docs/BACKLOG.md` (146 files) | **16 hits in 11 files** (13 in 10 other files, plus 3 in this file, measured after writing) | - |

`runVerify` (`closure-runner.ts:46`) still has no callers outside its own test
(Grep `runVerify\|provenAbleToFail\|closure-runner` over `src`: 4 lines in
`closure-runner.ts`, 5 in `closure-runner.test.ts`). `.github/workflows` holds
no test command at all (Grep for `vitest|npm test|npx` returns nothing; canary
`runs-on|run:` finds 9 lines in 3 files) - so the YAML rule guards a future
workflow, not a present one.

The 16 S8 hits:

| File | Lines (family:paths) | What it is | Item state |
|---|---|---|---|
| `docs/REGRESSION.md` | 389 (vitest:2), 516 (vitest:3) | baseline evidence records | history |
| `docs/a11-scope.md` | 598 (vitest:4) | A11 "machine verify" | closed |
| `docs/a16-plan.md` | 1425 (2), 1426 (2) | measurement records | A16 actionable |
| `docs/a18-ac.md`, `docs/a18-test-notes.md` | 60 (3), 788 (3) | A18 enforcers' evidence and instrument | A18 actionable |
| `docs/a19-scope.md` | 945 (2) | an **instrument** for a pass condition | A19 unscoped |
| `docs/a20-scope.md` | 315 (2) | measurement record | A20 verification |
| `docs/a22-scope.md` | 1443 (2) | **step 2 of a gate table** | A22 unscoped |
| `docs/a23-criteria.md`, `docs/a23-test-notes.md` | 513, 623, 1297 (2 each) | AC-7's **instrument** | A23 unscoped |
| `docs/l14-scope.md` (this file) | 120 (vitest:2), 314 (vitest:2), 811 (npm-vitest:2) | the literal PowerShell repro, the argv-spawn canary quoted in 2.1, sabotage X14 | this row |

(`docs/backlog.yml` and `docs/BACKLOG.md` quote the c1 repro in L14's prose;
`backlog.yml` is not `.md` and `BACKLOG.md` is excluded - S6 governs the backlog,
and only its `verify` field.) Every path in the non-repro hits exists on disk
(round 0, `existsSync` per path over the detector's output), so none is partial
today; the exposure is forward. Three of the live instruments were written by
seats round 0 did not route: `a22-scope.md` by the architecture seat,
`a23-criteria.md` and `a18-ac.md` by `loop-ac` (the file headers, `:1-2`).

### 2.3 The caller nothing here can scan

The orchestrator's implementer briefs are prompt text outside the tree. The
in-tree choke points are where they are EXECUTED (`loop-implementer.md:11`,
"Read `docs/loop/this-repo.md` before touching a gate command") and CHECKED
(`loop-checker.md:33`, the silent-green question). R1.

---

## 3. Candidate fixes

### 3.1 Options

| Option | Mechanism | Catches the silent drops? | Verdict |
|---|---|---|---|
| A. existence-only wrapper | fail on a missing argument | not c10/c11 (the file exists) | insufficient alone |
| B. compare `Test Files N` to the path count (row option b) | parse the command | no - a directory legitimately yields 13 files from 1 argument (c4b), so the units differ | withdrawn |
| **C. JSON per-argument attribution** (row option c, generalised) | one run, JSON reporter, credit each argument separately | all | **recommended, with A as a pre-check** |
| D. a vitest option | - | none exists (1.3) | unavailable |
| E. change `TESTS_SUMMARY_RE` (`closure-runner.ts:31`) | read `Test Files` | same unit problem as B | not needed (8) |
| F. one vitest process per path | N startups | all | rejected: multiplies load, L15's trigger (6) |
| G. vitest programmatic API | per-filter `globTestSpecifications` | all | rejected: couples to `vitest/node` internals |

### 3.2 The wrapper

1. **Paths only.** An argument starting with `-` is refused before vitest
   spawns. Through npm this rarely fires (1.5); the direct form enforces it.
2. **Every argument exists on disk**, as a file or a directory; the probe
   records which. A bare substring (c8) is refused.
3. **One vitest run:** `process.execPath` on `node_modules/vitest/vitest.mjs`
   (the package `bin`: `{"vitest":"./vitest.mjs"}`), no shell, argv
   `run --reporter=default --reporter=json --outputFile.json=<absolute temp path> <paths...>`.
   The temp path is under `os.tmpdir()`, unique per call, removed in `finally`.
   Every flag in joined `=` form (1.6).
4. **A non-zero vitest exit is propagated.** A `null` exit (child killed by a
   signal) is exit 1, never 0.
5. **Missing or malformed report: fail closed**, exit 1.
6. **Attribution - REWRITTEN (B1).** vitest's substring rule decides only what
   RUNS. An argument is credited ONLY with executed files whose resolved
   repo-relative path (forward slashes; lower-cased on win32, where the file
   system is case-insensitive) is **EQUAL** to the argument's resolved path when
   the argument is a file, or lies **INSIDE** it (starts with the directory's
   path plus `/`) when the argument is a directory. An argument is COVERED only
   if it is credited at least one file AND those files report at least one
   `passed` assertion (the B4 rule of `closure-runner.ts:37-43`, per argument).
   A file vitest ran only because a substring matched - a "rider" - runs, and
   credits nothing.
7. **Report:** one line per argument, `COVERED` / `NOT COVERED`, credited files,
   passed count; exit 1 if any argument is not covered.

**Why step 6 had to change, measured on the real tree.** Five existing paths
contain no test file at all, yet each has riders - collected test files whose
path merely CONTAINS the argument:

| Argument | `.test.ts` files inside (`find <p> -name "*.test.ts" \| wc -l`) | Riders (`git ls-files 'src/*.test.ts' \| grep -ic <p>`) |
|---|---|---|
| `docs` | 0 | 2 (for example `src/lib/embedded/docs.test.ts`) |
| `supabase` | 0 | 19 |
| `src/lib/workflows/presets` | 0 | 12 (for example `src/lib/workflows/presets.kickoff.test.ts`) |
| `src/lib/workflow-triggers` | 0 | 6 |
| `src/lib/resource-links` | 0 | 2 |

(Canary for the rider count: the same `git ls-files 'src/*.test.ts' | wc -l`
returns 1097.) Under round 0's rule each would be COVERED; P6 as written in
round 0, pinned to vitest's behaviour, would have locked that in.

### 3.3 Cost

One npm script, one new directory of eight files (7.1). Round 0 timed the
direct-node prototype FASTER than raw `npx` (three alternating runs over two
files: raw 3202 / 3344 / 2972 ms, prototype 2010 / 1787 / 1796 ms, `date +%s%N`
around each); `npm run` adds npm's startup back, untimed. The RUN still follows
vitest's substring rule, so a directory argument without a slash may run riders
- broader, never narrower.

### 3.4 Prototype evidence

Round 0, `proto-wrapper.mjs` (substring attribution), on the real tree:
w1 missing path, w3 directory plus missing - pre-check failure, exit 1; w2 two
real files - exit 0; w4 directory plus file - exit 0; w5 existing `.tsx` and w6
`docs/DEV_LOOP.md` - `NOT COVERED`, exit 1; w7 `-t zz` - refused, and `zz`
fails the existence check; w9 backslash form - exit 0.

Revision 1, `arch-l14/proto2.mjs` (step 6 as rewritten), real tree, first
argument `src/tools/backlog/ids.test.ts` in each:

| Case | Second argument | Exit | Result |
|---|---|---|---|
| v1 | `docs` | 1 | ran 3 files; `NOT COVERED docs files=0` |
| v2 | `supabase` | 1 | ran 20 files; `NOT COVERED supabase files=0` |
| v3 | `src/lib/workflows/presets` | 1 | ran 13 files; `NOT COVERED ... files=0` |
| v4 | `src/lib/workflow-triggers` | 1 | ran 7 files; `NOT COVERED ... files=0` |
| v5 | `src/lib/resource-links` | 1 | ran 3 files; `NOT COVERED ... files=0` |
| v6 | (first) `src/tools/backlog`, no slash | 0 | `COVERED src/tools/backlog files=13 passed=102` - containment, not substring |
| v7 | `src/tools/backlog/areas.test.ts` | 0 | both COVERED (4 and 8 passed) |
| v8 | `src/does-not-exist.test.ts` | 1 | pre-check failure |
| v9 | `docs/DEV_LOOP.md` | 1 | `NOT COVERED docs/DEV_LOOP.md files=0` |

Every rider RAN (v2 ran 20 files for two arguments) and credited nothing.

**Tree integrity.** Over a re-run of v1 and v3, per-file sha1 of every
`git ls-files src docs` path was identical before and after
(`git ls-files src docs | xargs sha1sum`, `diff` empty), and no
`l14-arch-*` report remained in the temp directory. An earlier whole-tree
aggregate hash over v1-v9 DID differ; `git status --short` showed the
`src/app/components/repo-grades/` files, which another agent was editing
concurrently, changing state during that run, so the aggregate could not
isolate my run - which is why the per-file re-run exists.

---

## 4. Shape - the layers, and which one the user reaches

The user is an agent or the owner running a gate. **They reach layer 3 by the
command spelled in the layer-4 documents.**

| Layer | What | Called by |
|---|---|---|
| 1. Logic leaf | `src/tools/vitest-paths/paths-gate.ts` - pure: pre-check, attribution, decision, argv | layer 2 |
| 1b. Detector leaf | `src/tools/vitest-paths/raw-invocation.ts` - pure: `findTestCommands`, `callCommands` | layer 5 |
| 2. CLI | `src/tools/vitest-paths/cli.ts` - `dispatch(argv, deps)` plus a thin `main`, the `src/tools/backlog/cli.ts:1-19` pattern | layer 3 |
| 3. **Surface** | `package.json` script `"test:paths"` | agents and the owner, either shell |
| 4. Routing | `docs/loop/this-repo.md` section 1, `docs/loop/traps-tests.md`, all eight `.claude/agents/*.md` | every seat that writes or runs a gate |
| 5. Enforcer | `src/tools/vitest-paths/gate-commands.structure.test.ts` | `npm test`, in every wave gate |

**The command, as documents spell it:** `npm run test:paths src/a.test.ts src/b.test.ts`
(positional arguments pass through npm in both shells, 1.7). Direct form:
`node --experimental-strip-types --experimental-default-type=module --experimental-loader ./src/tools/backlog/resolve-ts-hook.ts src/tools/vitest-paths/cli.ts <paths...>`.

**Reuse, each opened:**

| Symbol | Where | Gives |
|---|---|---|
| loader hook `resolve` | `src/tools/backlog/resolve-ts-hook.ts:32-` | extensionless relative imports under type stripping; directory-agnostic, reuse unchanged |
| `dispatch` + thin `main` | `src/tools/backlog/cli.ts:1-19` | every CLI branch testable without a subprocess |
| B4 rule | `src/tools/backlog/closure-runner.ts:37-43` | "at least one passed", applied per argument |
| explicit subprocess-test timeout | `src/tools/backlog/closure-runner.test.ts:41,52,62` (`30_000`) | the L15-safe idiom |
| `parseBacklogYaml` | `src/tools/backlog/yaml-codec.ts` | reading `verify` as data |

**Do not reuse:** `runVerify` (`closure-runner.ts:46`) - a shell-parsed free-text
command, the quoting surface this design removes. `TESTS_SUMMARY_RE` - console
text; the report has the per-file structure it lacks.

### 4.1 Seams

```ts
// src/tools/vitest-paths/paths-gate.ts  (pure: no fs, no child_process)
export type PathKind = "file" | "dir";
export type PreCheck = { ok: true; kinds: ReadonlyMap<string, PathKind> } | { ok: false; problems: string[] };
export function preCheckArgs(args: readonly string[], probe: (p: string) => PathKind | null): PreCheck;

export interface ExecutedFile { relPath: string; passed: number } // resolved, repo-relative, "/" separators, lower-cased on win32
/** null when the report is missing or not the measured shape (1.4) - callers fail closed. */
export function executedFilesFromReport(report: unknown, root: string): ExecutedFile[] | null;

/** EQUAL for a file argument, INSIDE for a directory argument. Never vitest's substring rule. */
export function creditsArg(file: ExecutedFile, arg: string, kind: PathKind, root: string): boolean;

export interface PathCoverage { arg: string; files: number; passed: number; covered: boolean }
export function coverageOf(args: readonly string[], kinds: ReadonlyMap<string, PathKind>, files: readonly ExecutedFile[], root: string): PathCoverage[];

export interface GateDecision { exitCode: number; lines: string[] }
/** vitestExit null (signal) is exit 1. */
export function decide(args: readonly string[], kinds: ReadonlyMap<string, PathKind>, vitestExit: number | null, report: unknown, root: string): GateDecision;

/** Every element starting with "-" contains "="; the report path is outside root; paths last, in order. */
export function vitestArgv(args: readonly string[], reportPath: string): string[];
```

```ts
// src/tools/vitest-paths/raw-invocation.ts  (pure)
export type CommandFamily = "vitest" | "npm-vitest" | "wrapper";
export interface TestCommand { line: number; family: CommandFamily; paths: string[]; norm: string } // norm = `${family}: ${paths.join(" ")}`
export function findTestCommands(text: string, vitestScripts: readonly string[]): TestCommand[];
export function callCommands(source: string, vitestScripts: readonly string[]): TestCommand[];
```

```ts
// src/tools/vitest-paths/cli.ts
export interface PathsCliDeps {
  root: string;
  probe: (p: string) => PathKind | null;
  runVitest: (argv: string[]) => number | null; // spawnSync(process.execPath, [vitestBin, ...argv], { stdio: "inherit", cwd: root }).status
  newReportPath: () => string;                  // under os.tmpdir(), unique per call
  readReport: (p: string) => unknown;           // JSON.parse, or undefined on any error
  removeReport: (p: string) => void;
}
export function dispatch(argv: readonly string[], deps: PathsCliDeps): GateDecision;
```

Every requirement's inputs reach its object: `decide` receives the arguments,
their kinds, the report and the exit code - everything step 6 needs, including
the file-versus-directory distinction round 0's `matchesArg` could not receive.

---

## 5. The surface: routing and enforcement

### 5.1 Routing (layer 4) - every file is pinned by P11

- **`docs/loop/this-repo.md` section 1**: a subsection inserted after the gate
  table and before `### The build gate does not exit 0` (`:26`), "Running a
  named set of test files": the defect in one sentence, `npm run test:paths` as
  the only form for two or more paths, a single path may still use
  `npx vitest run <path>`. `src/loop-docs.structure.test.ts:248-252` anchors on
  `The four lint warnings are the baseline` (`:61`), `SnapshotGradingPanel` and
  `## 2. Tests` (`:87`); an insertion before `:26` moves none of them.
- **`docs/loop/traps-tests.md`**: two entries with their instances - the silent
  drop (every spelling of 1.7), and the optional-value flag that swallowed a
  test file (1.6). The first must say what 1.5 says: through npm the wrapper's
  flag refusal rarely fires, and the existence check plus broadening is what
  protects the run. Both DESCRIBE commands rather than pasting raw two-path
  ones - S2 holds this card at zero.
- **All eight `.claude/agents/*.md`**:
  - `loop-implementer.md` (house rules, `:33-`): two or more test paths run only
    through the wrapper; a brief that spells a raw multi-path run is executed
    through the wrapper instead, and the report says so.
  - `loop-plan.md:81` (the per-wave gate), `loop-test-author.md` (`:119-`),
    `loop-ac.md` (`:71-`), `loop-architect.md` (`:68-`), `loop-top.md`: any
    instrument or gate naming two or more test files is spelled with the
    wrapper.
  - `loop-seat.md` (`:44-`): a verification report quotes the wrapper's
    per-argument lines.
  - `loop-checker.md:33` (silent-green): ask whether any gate or instrument in
    the artifact runs two or more paths without the wrapper.

`docs/DEV_LOOP.md` is not edited; it defers gate commands to `this-repo.md`.

### 5.2 The structure test (layer 5)

`src/tools/vitest-paths/gate-commands.structure.test.ts`, using
`findTestCommands` and `callCommands`, with the npm scripts that expand to
vitest READ from `package.json` (not hard-coded - a new `test:unit` script is
then covered without an edit).

| Scope | Files | Rule |
|---|---|---|
| S1 | `.claude/agents/*.md` | zero raw multi-path (families vitest, npm-vitest) |
| S2 | `docs/DEV_LOOP.md`, `docs/loop/*.md` | zero raw multi-path |
| S3 | `AGENTS.md`, `CLAUDE.md` | zero raw multi-path |
| S4 | every `package.json` `scripts` value | zero raw multi-path |
| S5 | `.github/workflows/*` (YAML block scalars joined) | zero raw multi-path |
| S6 | every non-null `verify` in `docs/backlog.yml` via `parseBacklogYaml` | **zero commands of ANY family, wrapper included, with two or more paths (M1)** - this is the single-path ruling's enforcer (8) |
| S7 | every `src/**` file importing `node:child_process` or `child_process`, scanned as text AND through `callCommands` | zero raw multi-path |
| S8 | every `docs/**/*.md` except `docs/BACKLOG.md` | **a frozen SET of hits**, each `{ file, norm }`; RED on a hit not in the set AND on a set entry no longer found (m1) |

S2 overlaps S8 (`docs/loop/`, `DEV_LOOP.md`); those files are held at zero by S2
and never appear in the S8 set. **The S8 set is populated from the implementer's
own detector run at build time**, not from 2.2 - A16 and others are editing
docs now. A converting item (R2) removes its entry in the same commit, which
puts this test in that item's write set; that coupling is the price of m1's
exactness and is stated in R2 and R6.

**Self-reference.** Fixtures with two paths are BUILT from separate words -
`["npx", "vitest", "run", "src/a.test.ts", "src/b.test.ts"].join(" ")` - never
as a literal, and never as `"npx vitest run"` plus paths. Round 0 checked that
the phrase spelling fires the text detector (1 hit) and the word spelling does
not (0). Under revision 1, the fixture files that do not import `child_process`
fall in no scope; `cli.e2e.test.ts` does import it and is in S7, where its
wrapper spawns are the wrapper family and count only in S6.

**Canary block, before the real scan:** the detector fires on the c1 fixture and
on an argv-spawn fixture; each of S1, S2, S4, S7, S8 is non-empty; S1's listing
contains `loop-implementer.md` by name (the dot-directory was really read); S6's
predicate fires on a fixture row whose `verify` is a two-path WRAPPER command
(S6 is empty today, all 43 `verify` values are null).

**Surface-is-named (P11):** `package.json` has `test:paths` and the `.ts` path in
it exists; each of the ten routing files of 5.1 (`this-repo.md`,
`traps-tests.md`, eight agent definitions) contains the string `test:paths`. A
fact, never a sentence.

---

## 6. L15 - no collision, and now enforced

L15 is a load-sensitive false RED under vitest's unconfigured 5-second default
(`grep -n testTimeout vitest.config.ts` returns nothing; the `test:` block is
`vitest.config.ts:27-40`).

1. One vitest process per wrapper call (option F rejected for this reason).
2. No `--testTimeout` and no kill timer in the wrapper: whatever L15 sets in
   `vitest.config.ts` applies unchanged.
3. `cli.e2e.test.ts` spawns real vitest: every `it` carries an explicit
   `30_000` (the `closure-runner.test.ts:41` idiom). **P13 enforces it.**
4. The structure test walks `docs/**/*.md` - 146 tracked files, 7,619,744 bytes
   (`git ls-files docs | grep -c "\.md$"`; `... | xargs cat | wc -c`) - plus
   S1-S7: it reads each file ONCE into a module-scope corpus, and every `it`
   carries an explicit timeout. **P13 enforces both.**
5. P1-P3 nest vitest over LIGHT files (`src/tools/backlog/ids.test.ts`, 4
   tests; `areas.test.ts`, 8 tests - v7), never `no-emojis.test.ts`, which walks
   the whole tree.
6. It enlarges L15's walker set: `grep -rlE "readdirSync|walkTsxFiles" --include=*.test.ts src | wc -l`
   returns **38**, not the L15 row's 32 (R9).

---

## 7. The wave

**ONE wave.** Layers 1-3 without 4-5 would be a wrapper nobody is told to call.

### 7.1 Write set (`owns`)

| Path | New / edited | Estimate |
|---|---|---|
| `src/tools/vitest-paths/paths-gate.ts` | new | ~140 lines |
| `src/tools/vitest-paths/paths-gate.test.ts` | new | ~200 |
| `src/tools/vitest-paths/raw-invocation.ts` | new | ~200 (prototype `detect2.mjs` is 150) |
| `src/tools/vitest-paths/raw-invocation.test.ts` | new | ~140 |
| `src/tools/vitest-paths/cli.ts` | new | ~90 |
| `src/tools/vitest-paths/cli.test.ts` | **new (m4)** | ~110 |
| `src/tools/vitest-paths/cli.e2e.test.ts` | new | ~90 |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | new | ~220 |
| `package.json` | one `scripts` entry | +1 |
| `docs/loop/this-repo.md` | section 1 subsection | +12 to +18 (307 today, `wc -l`) |
| `docs/loop/traps-tests.md` | two entries | +20 to +30 (77) |
| `.claude/agents/loop-implementer.md` | edited | +4 (58) |
| `.claude/agents/loop-plan.md` | edited | +2 (84) |
| `.claude/agents/loop-test-author.md` | edited | +2 (129) |
| `.claude/agents/loop-seat.md` | edited | +2 (55) |
| `.claude/agents/loop-checker.md` | edited | +2 (64) |
| `.claude/agents/loop-ac.md` | **edited (M2)** | +2 (81) |
| `.claude/agents/loop-architect.md` | **edited (M2)** | +2 (82) |
| `.claude/agents/loop-top.md` | **edited (M2)** | +2 (61) |

(`wc -l .claude/agents/*.md docs/loop/traps-tests.md docs/loop/this-repo.md`.)
**19 paths.** No `src/` file approaches 1000 lines. Nothing in
`docs/backlog.yml` / `docs/BACKLOG.md`: closing L14 and updating its residual
text (R11) is the orchestrator's; an implementer edit there would pull
`backlog-file.structure.test.ts:60` (`EXPECTED_ROW_COUNT = 43`) into the set.

### 7.2 Readers of the edited files as source text

Command 1 (files reading an edited doc, agent definition or `package.json` by
path):

```
$ grep -rnE "(readFileSync|readDoc|resolve|join)\([^)]*(this-repo\.md|traps-tests\.md|\.claude|package\.json|docs/loop)" --include=*.ts src
src/loop-docs.structure.test.ts:68:  const source = readDoc("docs/loop/iteration-caps.md");
src/loop-docs.structure.test.ts:96:  const source = readDoc("docs/loop/seats.md");
src/loop-docs.structure.test.ts:121:  const source = readDoc("docs/loop/seats.md");
src/loop-docs.structure.test.ts:144:  const leveragePath = path.join(REPO_ROOT, "docs/loop/leverage.md");
src/loop-docs.structure.test.ts:225:  const source = readDoc("docs/loop/parallel-disjointness.md");
src/loop-docs.structure.test.ts:248:  const source = readDoc("docs/loop/this-repo.md");
```

Canary: the same pattern with `DEV_LOOP` returns `src/loop-docs.structure.test.ts:26`
and `:51`. Command 2 (whole-`docs/` readers): `src/lib/no-emojis.test.ts`
(`:243`), plus a false hit in `src/lib/live-class/links.test.ts`. Command 3
(`src/` walkers): `grep -rlE "readdirSync|walkTsxFiles" --include=*.test.ts src`,
38 files, including `file-size-ceiling.structure.test.ts`,
`source-bytes.structure.test.ts` (skips `.claude`, `:38`), `no-emojis.test.ts`
and `module-graph/runtime-import-graph.test.ts`.

| Reader | Class |
|---|---|
| `src/loop-docs.structure.test.ts` | checked-safe, run-only (anchors untouched, 5.1) |
| `src/lib/no-emojis.test.ts` | run-only - no emoji, no pasted check or cross mark |
| `source-bytes`, `file-size-ceiling` structure tests | run-only |
| the other `src/` walkers | run-only through the full `npm test`; `src/tools/backlog/` is the precedent of a Node-only tool directory that passes them |
| `src/tools/backlog/backlog-file.structure.test.ts` | run-only; the codec is imported, not edited |
| `src/tools/backlog/closure-runner.test.ts` | run-only; now in S7 |

**Disjointness:** nothing under `src/app/components/repo-grades/`,
`src/app/components/canvas-tab/` or `src/app/actions/prompt-announcement-*`.
Shared resource no list shows: **S8 reads every `docs/**/*.md`, including docs
other agents are writing** - after this lands, a new raw multi-path command in
any doc turns `npm test` red for everyone. Intended; tell the seats in the same
push.

### 7.3 The wave gate

| Step | Command | Pass |
|---|---|---|
| 1 | `git status --short` | exactly the 19 paths of 7.1 plus what was dirty at start (recorded); no `.claude/worktrees` path |
| 2 | `npx vitest run src/tools/vitest-paths/` | green (one directory argument is loud when it matches nothing, c4) |
| 3 | `npm run test:paths src/tools/vitest-paths/ src/loop-docs.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts` | exit 0, five `COVERED` lines |
| 4 | the same with one path misspelled, and separately with `docs` added | **exit 1** each, naming the bad argument |
| 5 | `npm test` | green; file count = baseline + 5 new test files |
| 6 | `npx tsc --noEmit` (the ONE caller), `npm run lint` | no output / the baseline warning count |
| 7 | section 9.1 sabotage | each RED observed, then restored from a COPY |

---

## 8. The single-path ruling for a row's `verify`

The L14 row's `note` records: **a row's `verify` is single-path, option (a)**.
This design KEEPS it. Round 0 claimed S6 enforced it while its detector
ignored the wrapper and every non-`vitest run` spelling (M1, B2): a `verify` of
`npm test a b` or `npm run test:paths a b` passed. Revision 1's S6 counts path
arguments on every family, wrapper included - so the ruling now has a real
enforcer, and the closure-runner's file-count blindness (`closure-runner.ts:31`
reads only the `Tests` line) is acceptable because S6 keeps multi-path commands
out of `verify`. No change to `TESTS_SUMMARY_RE`.

**A fact for the owner, not a ruling:** the wrapper makes a multi-path `verify`
runner-decidable, which removes the ruling's first stated reason; its second
("forces the oracle for a chunk into one file") stands. Relaxing it is the
owner's call and a one-predicate change in S6.

| Row option | Disposition |
|---|---|
| (a) single-path `verify` | KEPT; enforced by S6 |
| (b) compare the `Test Files` count to the path count | WITHDRAWN - wrong unit (c4b) |
| (c) require the JSON reporter and assert the file set | KEPT, generalised, as the wrapper's mechanism for gates - not for `verify` |

---

## 9. Pass conditions

Object, instrument, direction of failure. P1-P3 spawn the SURFACE: the exact
command string read from `package.json` `scripts["test:paths"]`, each `it` with
a `30_000` timeout.

| Id | Object | Instrument | RED when |
|---|---|---|---|
| P1 | exit code for `src/tools/backlog/ids.test.ts src/does-not-exist.test.ts` | `cli.e2e.test.ts` | exit is 0 |
| P2 | exit code and lines for `src/tools/backlog/ids.test.ts src/tools/backlog/areas.test.ts` | `cli.e2e.test.ts` | exit is non-zero, or either argument is not COVERED |
| P3 | exit code for `src/tools/backlog/ids.test.ts docs/DEV_LOOP.md` | `cli.e2e.test.ts` | exit is 0 |
| P4 | whether vitest is spawned when an argument starts with `-` | `cli.test.ts`, `dispatch` with a `runVitest` spy | the spy is called, or the exit is 0 |
| P5 | the decision when vitest exits 0 but the report is `undefined`, `{}` or `{ testResults: "x" }` | `paths-gate.test.ts`, `decide` | any yields exit 0 |
| P6 | attribution over constructed reports in the measured shape (1.4) | `paths-gate.test.ts`, `coverageOf` | any row differs: file argument credited only by EQUAL path (with `./`, backslash, upper-case and absolute spellings of the same file all credited); directory credited only by files INSIDE it, with and without a trailing slash; a sibling sharing a prefix (`src/tools/backlog-foo/x.test.ts` against `src/tools/backlog`) NOT credited; a path whose files are all skipped NOT covered; **and the five real test-less paths of 3.2 - `docs`, `supabase`, `src/lib/workflows/presets`, `src/lib/workflow-triggers`, `src/lib/resource-links` - each NOT covered given their real riders as executed files** |
| P7 | vitest's argv as built | `paths-gate.test.ts`, `vitestArgv` | any element starting with `-` lacks `=`; the report path lies inside `root`; the paths are not last or not in the given order |
| P8 | a propagated RED | `paths-gate.test.ts`, `decide` with exit 1 and an all-covered report | exit is 0 |
| P9 | the detector | `raw-invocation.test.ts`, the 40 canary cases of 2.1 as a table, built at runtime | any case's result differs |
| P10 | S1-S8 over the real tree | `gate-commands.structure.test.ts` | a zero-scope hit; an S6 command of any family with two or more paths; an S8 hit not in the frozen set, or a frozen entry no longer found; a canary not firing |
| P11 | the surface is named | same | `scripts["test:paths"]` missing, its `.ts` path absent, or `test:paths` absent from any of the ten routing files of 5.1 |
| P12 | a signal-killed child | `cli.test.ts`, `dispatch` with `runVitest` returning `null` and an all-covered report | exit is 0 |
| P13 | the L15 obligations | `gate-commands.structure.test.ts`, reading `cli.e2e.test.ts` and its own source as text | an `it(` call in either file has no explicit numeric timeout argument (at least `30_000` in `cli.e2e.test.ts`); or the structure test's own source has a `readFileSync` call lexically inside an `it(` callback |

P13 is a source-text assertion; it pins the FACT (a timeout argument present, no
read inside a test body), not a spelling, per `traps-tests.md` on
over-specifying source-text tests.

### 9.1 Sabotage - each must be observed RED

| Id | Mutation | Expected |
|---|---|---|
| X1 | `decide` treats an argument credited zero files as covered | **P3 red**; P1 stays red through the pre-check - record it |
| X2 | delete the pre-check and the flag refusal | **P4 red**; P1 stays red through attribution - record it |
| X3 | drop the per-argument `passed > 0` requirement | P6's all-skipped row red |
| X4 | report path under `root` | P7 red |
| X5 | a raw two-path `vitest run` line in a COPY-backed `loop-implementer.md` | P10 red, naming the file |
| X6 | the same in a new `docs/l14-sabotage.md` | P10 red (hit not in the S8 set) |
| X7 | the same with ONE path | P10 stays GREEN |
| X8 | rename `test:paths` in `package.json` | P11 red |
| X9 | a two-path `verify` on one COPY-backed backlog row, once as `vitest run`, once as the wrapper (the render check in `backlog-file.structure.test.ts` also goes red - expected, name it) | P10 red under S6, both times |
| X10 | `creditsArg` uses vitest's substring rule (round 0's) | **P6 red on all five test-less paths** and on the sibling-prefix row |
| X11 | S6 ignores the wrapper family | P10 red on X9's wrapper spelling |
| X12 | remove the timeout from one `it` in `cli.e2e.test.ts` | P13 red |
| X13 | move the corpus read into an `it` body | P13 red |
| X14 | `npm test src/a.test.ts src/b.test.ts` as a line in a COPY-backed `loop-ac.md` | P10 red - a non-`vitest run` spelling |
| X15 | delete the `test:paths` routing line from a COPY-backed `loop-top.md` | P11 red |

---

## 10. Leverage question

Asked, per `docs/loop/leverage.md`. **No claim is owed and none is made:** L14
is `kind: bug`, `area: loop-and-docs-maintenance`, and changes no capability an
app user reaches (`DEV_LOOP.md`, Criteria, exempts a bug fix). The three-way
call is not owed and I am not defaulting it.

---

## 11. Seat triage

| Seat | Runs? | Trigger |
|---|---|---|
| Acceptance criteria | yes | always; `src/` and `package.json` change |
| Architect | this document | new directory, more than two existing files |
| Reliability | yes | a temp file to release, a child process, fail-closed on a missing report, a signal-killed child |
| Security | no - not fired | no server action, no egress, no text reaching a prompt or the DOM, no credential path; no shell in the spawn |
| External-facts research | fired, discharged here | vitest 4.1.9 and npm 10.9.2 behaviour measured in 1 |
| Baseline | yes | `grep -ac "closure-runner\|vitest-paths\|test:paths" docs/REGRESSION.md` returns 0 |
| UX, Visual, Accessibility | no - not fired | no user surface |
| Data / storage | no - not fired | nothing persisted |
| Operability | no - not fired | nothing to configure |
| Test seat | yes | always |

---

## 12. Residual register

Owner, instrument, step for each. R1-R10 were filed in substance into the L14
row's `note` at `0b96cab`; revision 1 changes R2, R3, R5, R6 and R7, so that
filed text now lags (R11).

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | Implementer briefs are off-tree; nothing scans them | orchestrator; every wave's checker | the implementer's report quoting the command it ran (`loop-implementer.md` tells it to run the wrapper instead of a raw multi-path gate), read by Verify | Verify of every wave after this lands |
| R2 | Live raw multi-path instruments in open items: `a19-scope.md:945` (A19), `a22-scope.md:1443` (A22), `a23-criteria.md:513,623` and `a23-test-notes.md:1297` (A23) | each item's next plan or test seat - **whose write set must then include `gate-commands.structure.test.ts`, to remove the entry from the S8 set in the same commit** | the S8 frozen set | that item's next revision |
| R3 | `closure-runner.ts:31` stays blind to file counts; acceptable only while S6 holds for EVERY family, wrapper included | this chunk's S6 | P10 under S6; X9, X11 | every `npm test` |
| R4 | `runVerify` has no production callers | orchestrator - decide whether an item gives it one; needs its own row | `grep -rn "runVerify" src` | the next backlog-automation item |
| R5 | npm swallows `-t`, `--reporter` and (checker) `--json`, `--outputFile`, `--testNamePattern=` without `--`, in both shells; PowerShell strips a bare `--` to `npm.ps1` (checker). Through the wrapper, a displaced value fails the existence check and a swallowed flag only broadens the run; the raw `npm test` path is unchanged | the L14 implementer, as the `traps-tests.md` entry of 5.1 | none mechanical - a documented hazard | the L14 wave |
| R6 | S8's exact set couples every conversion of an old doc to a one-line edit of the structure test | accepted cost of m1 | P10 | stated in R2 |
| R7 | Only PATH-SHAPED arguments are counted, and the scan stops at the first bare word; so `npx vitest run foo bar` (two bare substrings) is not caught statically. The wrapper refuses bare substrings at runtime (existence check) | accepted limit | P9's table | none |
| R8 | No regression entry for gate tooling | baseline seat | `grep -ac "test:paths" docs/REGRESSION.md` > 0 | before hand-off |
| R9 | L15's walker count is stale (row 32, measured 38) and this chunk adds a walker and a spawner | orchestrator, into L15 | `grep -rlE "readdirSync\|walkTsxFiles" --include=*.test.ts src \| wc -l` | L15 scoping |
| R10 | The `--json` optional-path trap (1.6) | the L14 implementer: `vitestArgv` plus P7, and a `traps-tests.md` entry | P7; `git status --short` after any measurement | the L14 wave |
| R11 | The L14 row's filed residual text (`0b96cab`) describes round-0 R2, R3, R5, R6, R7 (count ratchet, wrapper-blind S6, "the wrapper refuses flags") | orchestrator | diff of that `note` against this table | this revision's disposal |

---

## 13. What I could not determine, and what I measured about this file

- `npm run test:paths` timing (only the direct node form was timed, round 0).
- The PowerShell hashtable disagreement (1.1) and the unquoted-glob Bash case
  (1.2).
- The PowerShell `--` mechanism and npm's swallowing of `--json`,
  `--outputFile` and `--testNamePattern=` are the round-0 checker's
  measurements; I re-measured `-t` and `--reporter` only (1.5).
- Whether the S8 set in 2.2 still holds at build time - A16 and others edit
  docs; the implementer measures it.
- Nothing about this file's own S8 hits is undetermined: the revision-1
  detector over this file after writing (`arch-l14/self.mjs`) reports 3 raw
  hits, listed in 2.2 (so S8 today is 16 hits in 11 files, counting this one: `node arch-l14/census3.mjs` prints `S8 docs scanned 146 hits 16 files 11`),
  plus 2 wrapper-family hits, which S8 does not govern.
- Nothing about components: this chunk has no UI.
