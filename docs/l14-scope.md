# L14 scope - a multi-path vitest gate that silently covers less than it names

Seat: architecture (`loop-architect`), round 0. Date: 2026-09-21. Tree: `main`
at `e757702`, vitest 4.1.9 (`npx vitest --version` prints
`vitest/4.1.9 win32-x64 node-v22.14.0`).

Inputs read before writing: `docs/DEV_LOOP.md`, `docs/loop/seats.md` (triage,
Architect + reuse survey), `docs/loop/leverage.md`, `docs/loop/this-repo.md`,
`docs/loop/traps-spec.md`, `docs/loop/traps-search.md`,
`docs/loop/traps-tests.md`, the L14 and L15 rows of `docs/backlog.yml`
(`python -c "import yaml,io; d={r['id']:r for r in yaml.safe_load(io.open('docs/backlog.yml',encoding='utf-8'))}; print(d['L14'])"`
and the same for `L15`).

This document decides SHAPE. It writes no production code. Every quantity names
the command that produced it; where a command was run through a shell helper,
the helper is shown.

---

## 0. The answer in five lines

1. **Reproduced on today's tree**, and wider than the row says: a missing path,
   a missing path next to a DIRECTORY, a quoted glob, a `.tsx` that exists, and
   a file outside `src/` that exists are all dropped silently, exit 0, whenever
   one other argument matches (section 1).
2. **No vitest option fixes it.** The drop is `filterFiles`'s `.some()` union in
   vitest's own source, and `--help` lists no strict-filter option (section 1.3).
3. **The normative layer has zero raw multi-path invocations; the live callers
   are per-item design documents (15 sites in 12 files) and the orchestrator's
   off-tree briefs** (section 2).
4. **Recommended fix: a paths-only wrapper, `npm run test:paths <p1> <p2> ...`,**
   that runs ONE vitest process with the JSON reporter and fails unless EVERY
   argument is an existing path that matched at least one executed file with at
   least one passing assertion (section 3). Prototyped in the scratchpad against
   the real tree: it fails every silent-drop case and passes every legitimate
   one (section 3.4).
5. **The surface is a layer, and it is delivered in the same wave as the tool**:
   `this-repo.md` section 1 and five agent definitions name the script, and a
   structure test fails when a raw multi-path `vitest run` appears in a gate
   definition, in any spawner in `src/`, in a backlog `verify`, or newly in any
   `docs/**/*.md` (section 5). The existing single-path ruling for a row's
   `verify` stands and gains its first enforcer (section 8).

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

The row's measurement (c1) reproduces exactly: `Test Files 1 passed (1)` /
`Tests 18 passed (18)`, exit 0. It also reproduces from PowerShell when typed
literally: `npx vitest run src/lib/no-emojis.test.ts src/does-not-exist.test.ts`
piped to `Select-String` printed the same two lines and `$LASTEXITCODE` was 0.

**The bold rows are the defect: every multi-argument case in which one argument
matches drops the others, whatever their shape.** A single argument is always
loud (c2, c4, c6). c11 matters most for the design: the dropped path EXISTS, so
a wrapper that only checks existence would pass it (section 3.4, w6).

**Instrument I discarded, and why.** A first matrix from PowerShell, passing
each case as `& npx vitest run @($c.a)` from a hashtable, returned exit 1 and
`No test files found` for c1, c5, c7 and c9 - disagreeing with both the literal
PowerShell invocation and the Bash matrix. I did not isolate why (the likeliest
reading is that the array reached vitest as one joined argument, but I did not
measure that). The Bash matrix and the literal PowerShell run agree, so they are
the evidence; the hashtable run is not.

### 1.2 Directory and glob, the two cases the brief asked for

- **Directory:** alone, a real directory runs its files (c4b, 13 files) and a
  missing one fails loudly (c4). Next to a missing path, the missing path is
  dropped (c5). A directory given WITHOUT a trailing slash also works and is a
  substring match, so `src/tools/backlog` would also match a sibling
  `src/tools/backlog-foo/` - overmatch, the safe direction (prototype case w8,
  section 3.4).
- **Glob:** vitest does not expand globs. A quoted glob alone fails loudly (c6);
  next to a real path it is dropped silently (c7). An UNQUOTED glob in Bash is
  expanded by the shell before vitest sees it, and PowerShell does not expand
  globs at all - so the same text means different things in the two shells here.
  I did not measure the unquoted Bash case.

### 1.3 Why, from vitest's own source, and why no option fixes it

`node_modules/vitest/dist/chunks/cli-api.24X8XwN1.js:10860-10871`,
`filterFiles(testFiles, filters, dir)`, opened: it keeps every collected test
file for which `filters.some(...)` matches, where a match is
`testFile.includes(f.toLocaleLowerCase()) || testFile.includes(relativePath.toLocaleLowerCase())`
on the file's lower-cased path relative to the root. The filters are consumed as
a UNION with no per-filter accounting, so nothing downstream can know that one
filter matched nothing. `globTestFiles` calls it at `:10779`. The only empty
check is on the union: `printNoTestFound` at `:1965-1969` fires when the whole
set is empty, which is why c2/c3/c4/c6 are loud and c1/c5/c7/c9/c10/c11 are not.

**No CLI or config option makes a filter strict.** `npx vitest run --help`
lists 65 options (`npx vitest run --help 2>&1 | tr -d '\000' | grep -ac "^  -\|^  --"`);
`grep -aiE "strict|exact|error.*filter|filter.*error|unmatched|must match"` over
that help returns exactly one line, `--strictTags`, which is about test TAGS, not
file filters (canary: the same grep finding `--strictTags` proves the grep can
match a line in that output). `passWithNoTests` only governs the empty-union
case. The installed package ships no docs directory (`ls node_modules/vitest`
lists `README.md`, `dist/`, type declarations and `vitest.mjs`), so the source
and `--help` are the documentation there is.

### 1.4 What the JSON reporter measures - `numTotalTestSuites` is NOT a file count

One run, three arguments, one missing:
`npx vitest run --reporter=default --reporter=json "--outputFile.json=$S/j2.json" src/lib/no-emojis.test.ts src/tools/backlog/ src/does-not-exist.test.ts`
exited 0 with `Test Files 14 passed (14)`, and the report read by
`node -e "const j=require(process.argv[1]); console.log(j.testResults.length, j.numTotalTestSuites, j.numTotalTests)"`
gave **`testResults.length` 14, `numTotalTestSuites` 34, `numTotalTests` 120.**
So `numTotalTestSuites` counts suites (files plus `describe` blocks) and must
never be compared to a path count; `testResults.length` is the file count. Each
`testResults[i]` carries `name` (absolute, forward slashes, e.g.
`C:/Users/.../src/lib/no-emojis.test.ts`), `status`, and `assertionResults[]`
whose entries carry `status` (`passed`, `skipped`, ...). Measured by printing
`Object.keys` of both levels from that report. The missing path appears nowhere
in the report - the JSON is as silent as the console.

Two reporters at once work: the console summary printed normally AND the JSON
file was written, in the same run.

### 1.5 A second silent-drop vector: PowerShell plus npm eats `-t`

From PowerShell, `npm test -- src/lib/no-emojis.test.ts -t zzNoSuchzz` echoed
`> vitest run src/lib/no-emojis.test.ts zzNoSuchzz` and ran 18 passing tests,
exit 0 - the `-t` flag never reached vitest, and its VALUE arrived as a second
path filter, matched nothing, and was dropped. The same command from Bash echoed
`> vitest run src/lib/no-emojis.test.ts -t zzNoSuchzz` and reported
`Tests 18 skipped (18)`. Measured outcome; I did not isolate whether PowerShell
or npm consumed `--`. Direction: the run covers MORE than intended (the whole
file, not one test), so it is less dangerous than L14 proper - but a sabotage
check that relies on `-t` to target one test is silently not targeting it.
Positional arguments DO pass through `npm test` from both shells without `--`
(`npm test src/lib/no-emojis.test.ts src/tools/backlog/ids.test.ts` echoed both
paths and ran `Test Files 2 passed (2)` from each shell; npm 10.9.2).

### 1.6 An incident this measurement caused, reported rather than buried

While measuring `vitest list`, I ran
`npx vitest list --filesOnly --json src/lib/no-emojis.test.ts src/does-not-exist.test.ts > /tmp/l.txt`.
`--json` takes an OPTIONAL path, so vitest consumed `src/lib/no-emojis.test.ts`
as the JSON output file and **overwrote the real test file with the two bytes
`[]`** (`od -c src/lib/no-emojis.test.ts` printed `[   ]`; `wc -c` 2;
`git diff --stat HEAD` showed 302 deletions). It was unmodified at session start
(the opening `git status` does not list it), so I restored it with
`git checkout -- src/lib/no-emojis.test.ts` and confirmed `wc -l` 302 and
`Test Files 1 passed (1)` / `Tests 18 passed (18)` afterwards. **Window of
damage: the file's mtime read 08:31 and the restore followed within minutes;
any agent that ran a gate over `no-emojis.test.ts` or `npm test` in that window
saw a false RED** ("No test suite found in file ... no-emojis.test.ts"), and my
own run of `closure-runner.test.ts` inside that window failed 2 of 7 for exactly
that reason, then passed 7 of 7 after the restore.

This is a design input, not only an apology: **a flag with an optional value
silently swallows the next positional argument, and the victim can be a test
file.** The wrapper below therefore builds its argv itself, uses only the
`--flag=value` form, and writes its report outside the repository.

---

## 2. Caller census - who builds a multi-path invocation

### 2.1 Instrument

A detector prototype, `census2.mjs` in the session scratchpad, reports every
`vitest run` invocation carrying two or more PATH-SHAPED positional arguments.
Path-shaped: contains `/` (not only slashes), contains a backslash (not a lone
continuation backslash), or ends `.test.ts`/`.test.tsx`. It skips flags and the
value of a value-taking flag, treats a quoted string as one token, stops at an
unquoted backtick, `|`, `;`, `&`, `<`, `>` or `)`, joins shell continuation
lines (trailing ` \` or PowerShell ` ` + backtick), and joins a Markdown inline
code span that wraps across lines (stripping a leading `//`, `*`, `#` or `>`
from the continuation line). It scans `git ls-files` plus untracked
non-ignored files with extensions `md|yml|yaml|json|ts|tsx|mjs|js`.

**Canary, 19 of 19 cases pass** (`node canary.mjs` in the scratchpad printed
`failures 0`): it FIRES on the c1 repro, a directory plus file, a shell
continuation, flags between paths, `.../` elided paths, a wrapped inline code
span, and two quoted paths; it does NOT fire on a single path, a single path
with `-t "a/b c/d"`, the prose "vitest runs in the node environment ... src/a
and src/b", the prose "a multi-path `vitest run` silently drops src/a.test.ts
src/b.test.ts", `<WS-2>` placeholders, two single-path runs on one line, the
wrapper command, a bare `npx vitest run`, "`npx vitest run` over both guard
files", a single path inside a `//`-wrapped comment span, a quoted flag whose
value contains a slash (`"--outputFile.json=a/b.json"`), or a fenced single
path. Three defects found and fixed while building it, each because a census
listed something it should not have or missed something it should: a FALSE
NEGATIVE - a wrapped inline span was missed (`REGRESSION.md:516` counted 2 of
its 3 paths, `a16-plan.md:1426` was not seen at all); a FALSE POSITIVE - `//`
comment prefixes on the continuation line counted as paths in three `src`
comments; and a FALSE POSITIVE found by running the detector over THIS file - a
quoted `--outputFile.json=...` flag counted as a path. All three are canary
rows now.

Cross-check against a second instrument: the Grep tool's count of the literal
`vitest run` over the repo (excluding `node_modules`) is 248 occurrences in 85
files; the detector sees 253 invocations over 2850 files. They measure different
things (lines versus invocations, and the detector includes untracked files),
and they agree to within that difference.

### 2.2 Result, per place the brief named

| Place | Raw multi-path invocations | How measured (and the canary that proves the search can hit) |
|---|---|---|
| `package.json` scripts | **0**. `"test": "vitest run"` at `package.json:10` takes arguments from the caller | `cat package.json` |
| `src/tools/backlog/closure-runner.ts` | **0 invocations, 0 callers.** `runVerify` spawns whatever `verify` string it is given (`:46-47`, `spawnSync(command, { shell: true })`); its only callers are its own test (Grep `runVerify\|provenAbleToFail\|closure-runner` over `src`: 4 lines in `closure-runner.ts` - `:46`, `:71`, `:77`, `:78` - and 5 in `closure-runner.test.ts`, nothing else) | Grep tool; canary is the definition line itself |
| `verify` fields in `docs/backlog.yml` | **0.** 43 rows, 43 `verify: null` (`grep -c "^  verify: " docs/backlog.yml` = 43; `... \| sort \| uniq -c` = `43   verify: null`; the YAML parse agrees, 43 rows and 0 non-null) | grep plus `yaml.safe_load` |
| `.claude/agents/*.md` (8 files) | **0.** Not one contains `vitest run` at all | Grep tool pointed AT `.claude/agents` (ripgrep skips dot-directories by default, so a repo-wide search is a false absence here); canary: `vitest` finds 5 lines in 3 of those files |
| `docs/loop/*.md` and `docs/DEV_LOOP.md` | **0.** No `vitest run` at all | Grep tool; canary: `vitest` finds 14 lines across the cards |
| `.github/workflows/*.yml` (3 files) | **0.** No `vitest`, `npm test` or `npx` at all - CI runs no tests | Grep tool pointed at `.github`; canary: `runs-on\|run:` finds 9 lines in 3 files |
| `src/**` (every `.ts`/`.tsx`) | **0.** 44 files mention `vitest run` (`grep -rl "vitest run" src \| wc -l`); every one is a comment, a doc comment, or a single-path `verify` fixture in `src/tools/backlog/*.test.ts` | detector plus reading the Grep hit list |
| Process spawners in `src/` | **1 file**: `closure-runner.ts` is the only importer of `node:child_process` (Grep `node:child_process\|from "child_process"` over `src`) | canary: the hit is the known spawner |
| `docs/**/*.md` per-item artifacts | **15 invocations in 12 files** - table below | detector |

The 15, with what each is and whether the item is still open (states from the
backlog parse above):

| Site | Paths | What it is | Item state |
|---|---|---|---|
| `docs/backlog.yml:318`, `docs/BACKLOG.md:42` | 2 | L14's own repro, deliberately naming a missing file | open (this row) |
| `docs/REGRESSION.md:389`, `:516` | 2, 3 | baseline evidence records | history |
| `docs/a11-scope.md:598` | 4 (two directories) | A11's "machine verify", written for `runVerify` | A11 not in the backlog (closed) |
| `docs/a16-plan.md:1425`, `:1426` | 2, 2 | a measurement record ("I ran ...") | A16 actionable |
| `docs/a18-ac.md:60`, `docs/a18-test-notes.md:788` | 3, 3 | the A18 enforcers' green evidence and instrument | A18 actionable |
| `docs/a19-scope.md:945` | 2 | an **instrument** for a pass condition | A19 unscoped |
| `docs/a20-scope.md:315` | 2 | measurement record | A20 verification |
| `docs/a22-scope.md:1443` | 2 (one directory) | **step 2 of a gate table** | A22 unscoped |
| `docs/a23-criteria.md:513`, `:623`, `docs/a23-test-notes.md:1297` | 2 each | AC-7's **instrument** | A23 unscoped |

**None of them is partial today.** For every site, every named path exists on
disk (a script over the detector's output, `existsSync` per path: `missing=none`
for all 13 non-repro sites; only the deliberate `src/does-not-exist.test.ts` in
the L14 row is missing). The exposure is forward, as the row says - but it is
not hypothetical: A19, A22 and A23 carry live instruments of this shape that a
future wave will copy.

### 2.3 The caller no instrument here can scan

**The orchestrator's implementer briefs are not in the tree.** The brief for
this seat says "every implementer brief says run vitest over these N files";
those briefs are prompt text, and nothing in this checkout can read them. The
only in-tree choke points are the places those briefs are EXECUTED and CHECKED:
`loop-implementer.md:11` ("Read `docs/loop/this-repo.md` before touching a gate
command"), the verification seats (`loop-seat.md`), and the checker
(`loop-checker.md:33`, the silent-green question). The design routes the fix
through those (section 5.2). It is a residual that a brief can still SAY a raw
multi-path command; what changes is that the agent executing it is told to
convert it (R1).

---

## 3. Candidate fixes

### 3.1 The four the brief named, plus the backlog row's three

| Option | Mechanism | Cost | Catches c1 / c5 / c7 / c9 / c10 / c11? | Verdict |
|---|---|---|---|---|
| **A. Existence-only wrapper** | resolve each argument on disk, fail if any is missing, then run vitest | smallest | c1, c5, c7, c9, c10 yes; **c11 NO** (the file exists), and a `.tsx` that exists would pass too | insufficient alone |
| **B. Count comparison** (the row's option b) | compare `Test Files N` (or `testResults.length`) to the number of paths | parse the command | **No.** A directory makes N greater than the path count legitimately (w4: 2 arguments, 14 files), so N cannot be compared to the argument count, and a typo next to a directory cancels out | rejected - its comparison is between two different units |
| **C. JSON per-path attribution** (the row's option c, generalised) | run once with the JSON reporter, then for EACH argument require at least one executed file that the argument matches under vitest's own `filterFiles` rule | a small pure leaf; one vitest process as today | **all six** | **recommended, together with A as a cheap pre-check** |
| **D. vitest option** | - | - | none exists (section 1.3) | not available |
| **E. Fix `TESTS_SUMMARY_RE`** | teach `closure-runner.ts:31` to read `Test Files` | parse the command, same unit problem as B | no, for the same reason as B | not needed: see section 8 |
| **F. One vitest process per path** | loop, single-path each (loud by c2) | N startups (about 1.8s each, measured below); multiplies load on a box L15 already shows is load-sensitive | all six | rejected - correct but collides with L15 (section 6) |
| **G. vitest programmatic API** (`createVitest` + per-filter `globTestSpecifications`) | exact attribution with vitest's own globbing | couples to `vitest/node` internals that change between majors | all six | rejected - the CLI plus JSON reporter is the documented surface |

### 3.2 Recommendation: A + C in one wrapper, and why

**A paths-only wrapper that pre-checks existence and post-checks attribution.**

1. Arguments are PATHS ONLY. Any argument starting with `-` is refused before
   vitest is spawned. This closes section 1.5 as well: through the wrapper, a
   `-t` that npm or PowerShell displaced arrives as an unknown path and fails
   the existence check (prototype w7). A gate that needs `-t` is a single-path
   run, which is already loud.
2. Every argument must exist on disk (file or directory). This refuses a bare
   substring filter like c8, which is legal vitest but is not a path a gate
   should name.
3. Run vitest ONCE: `process.execPath` on the resolved
   `node_modules/vitest/vitest.mjs` (the package's `bin`, measured with
   `node -e "console.log(require('./node_modules/vitest/package.json').bin)"` =
   `{"vitest":"./vitest.mjs"}`), NO shell, argv
   `run --reporter=default --reporter=json --outputFile.json=<absolute temp path> <paths...>`.
   The temp path is under `os.tmpdir()`, unique per invocation, deleted in a
   `finally`. Never a bare `--json` or a separated `--outputFile <value>` (1.6).
4. If vitest exits non-zero, propagate that exit code (a real RED stays red).
5. Parse the JSON. If it is missing or unparseable, FAIL CLOSED (exit 1).
6. For each argument, the covered files are the executed files the argument
   matches under vitest 4.1.9's rule (lower-cased repo-relative path contains
   the lower-cased argument with backslashes turned to slashes, or contains the
   argument's root-relative form). An argument is COVERED only if it matched at
   least one executed file AND those files report at least one `passed`
   assertion - the closure-runner's B4 rule (`closure-runner.ts:37-43`),
   applied per argument instead of per run.
7. Print one line per argument (`COVERED` / `NOT COVERED`, files, passed) after
   vitest's own output, and exit 1 if any argument is not covered.

Why this and not a bigger change: it keeps the ONE property the loop depends on
- a gate's exit code means what it says - without asking any agent to parse
anything, it adds no vitest process, and every rule in it is checkable in a
node-env unit test.

### 3.3 What it costs

- One more npm script and a directory of four small modules (section 7).
- Time: the prototype was FASTER than the raw command it replaces, because it
  skips `npx` resolution. Three alternating runs over the same two files
  (`date +%s%N` around each): raw `npx vitest run` 3202 / 3344 / 2972 ms,
  prototype 2010 / 1787 / 1796 ms. Via `npm run` the npm startup is added back;
  I did not time that path.
- It ties the attribution rule to vitest's `filterFiles` semantics. If a later
  vitest changes them, the rule can disagree with vitest in either direction.
  The unit tests pin the rule against the measured matrix, and the e2e tests
  run it against the real installed vitest, so a version bump that changes the
  semantics turns the e2e tests red rather than passing quietly (P3, P6).

### 3.4 Prototype evidence on the real tree

`proto-wrapper.mjs` in the session scratchpad (NOT production code) implements
3.2 steps 1-7. Run from the repo root through a helper that prints the exit and
the summary lines:

| Case | Arguments | Exit | Result |
|---|---|---|---|
| w1 | `src/lib/no-emojis.test.ts src/does-not-exist.test.ts` | 1 | pre-check: `does not exist on disk: src/does-not-exist.test.ts` |
| w2 | `src/lib/no-emojis.test.ts src/tools/backlog/ids.test.ts` | 0 | both COVERED (1 file / 18 passed; 1 file / 4 passed) |
| w3 | `src/tools/backlog/ src/does-not-exist.test.ts` | 1 | pre-check failure |
| w4 | `src/tools/backlog/ src/lib/no-emojis.test.ts` | 0 | COVERED 13 files / 102 passed; COVERED 1 / 18 |
| w5 | `src/lib/no-emojis.test.ts src/app/components/repo-grades/index.tsx` | 1 | vitest `Test Files 1 passed (1)`, then `NOT COVERED .../index.tsx files=0` - **the case existence alone misses** |
| w6 | `src/lib/no-emojis.test.ts docs/DEV_LOOP.md` | 1 | `NOT COVERED docs/DEV_LOOP.md files=0` - c11, closed |
| w7 | `src/lib/no-emojis.test.ts -t zz` | 1 | `flag not accepted: -t`, `does not exist on disk: zz` |
| w8 | `src/tools/backlog src/lib/no-emojis.test.ts` | 0 | directory without a slash COVERED (13 files) |
| w9 | `src\lib\no-emojis.test.ts src/tools/backlog/ids.test.ts` | 0 | backslash form COVERED |

`git status --short src/lib src/tools package.json` printed nothing after the
run: the prototype touched no tracked file and left no report in the tree.

---

## 4. Shape - the layers, and which one the user reaches

The "user" of this feature is an agent or the owner running a gate. **They reach
it through layer 3, by the command spelled in the documents of layer 4.** A
layer that nothing reaches is dead code with every gate green; each layer below
names its caller.

| Layer | What | Called by |
|---|---|---|
| 1. Logic leaf | `src/tools/vitest-paths/paths-gate.ts` - pure: pre-check, attribution, decision | layer 2 |
| 1b. Detector leaf | `src/tools/vitest-paths/raw-invocation.ts` - pure: `findRawMultiPathInvocations(text)` | layer 5 |
| 2. CLI | `src/tools/vitest-paths/cli.ts` - `dispatch(argv, deps)` pure core plus a thin `main`, the `src/tools/backlog/cli.ts:1-19` pattern | layer 3 |
| 3. **Surface** | `package.json` script `"test:paths"` | agents and the owner, from either shell |
| 4. Routing | `docs/loop/this-repo.md` section 1; `.claude/agents/loop-implementer.md`, `loop-plan.md`, `loop-seat.md`, `loop-test-author.md`, `loop-checker.md`; `docs/loop/traps-tests.md` | every seat that writes or runs a gate reads these by rule (`loop-implementer.md:11`, `loop-plan.md:81`) |
| 5. Enforcer | `src/tools/vitest-paths/gate-commands.structure.test.ts` | `npm test`, which every wave gate already runs |

**The one command, as documents will spell it:**
`npm run test:paths src/a.test.ts src/b.test.ts` - positional arguments pass
through npm from both shells without `--` (measured, section 1.5), and the
wrapper refuses flags, so the PowerShell `--` problem cannot smuggle anything
through. Direct form for a reader who wants no npm:
`node --experimental-strip-types --experimental-default-type=module --experimental-loader ./src/tools/backlog/resolve-ts-hook.ts src/tools/vitest-paths/cli.ts <paths...>`.

**Reuse, vetted by opening each:**

| Symbol | Where | What it gives us |
|---|---|---|
| `resolve` loader hook | `src/tools/backlog/resolve-ts-hook.ts:32-` | extensionless relative imports under `node --experimental-strip-types`; it is directory-agnostic (it rewrites any relative specifier without an extension), so `cli.ts` in a sibling directory can use it unchanged - reuse, do not copy |
| `dispatch` + thin `main` pattern | `src/tools/backlog/cli.ts:1-19` | a CLI whose every branch is testable without a subprocess |
| B4 rule | `src/tools/backlog/closure-runner.ts:37-43` | "at least one passed" - applied per argument here |
| 30-second per-test timeout for a subprocess test | `src/tools/backlog/closure-runner.test.ts:41,52,62` | the idiom for a test that spawns vitest |
| `parseBacklogYaml` | `src/tools/backlog/yaml-codec.ts` (imported by `backlog-file.structure.test.ts`) | reading `verify` fields as data, not as text |

**Do not reuse:** `runVerify` (`closure-runner.ts:46`) - it runs a free-text
command through a shell, which is exactly the quoting surface this design
removes, and it has no callers to inherit. `looksLikeVitestOutput` /
`TESTS_SUMMARY_RE` - they parse console text; the wrapper reads the JSON report,
which carries the per-file structure the console line lacks.

### 4.1 Seams - exact signatures

```ts
// src/tools/vitest-paths/paths-gate.ts  (pure; no fs, no child_process)
export type PreCheck = { ok: true } | { ok: false; problems: string[] };
export function preCheckArgs(args: readonly string[], exists: (p: string) => boolean): PreCheck;

export interface ExecutedFile { relPath: string; passed: number } // repo-relative, "/" separators, lower-cased
/** null when the report is missing or not the shape measured in section 1.4 - callers fail closed. */
export function executedFilesFromReport(report: unknown, root: string): ExecutedFile[] | null;

/** vitest 4.1.9 filterFiles semantics, cli-api.24X8XwN1.js:10860-10871. */
export function matchesArg(relPath: string, arg: string, root: string): boolean;

export interface PathCoverage { arg: string; files: number; passed: number; covered: boolean }
export function coverageOf(args: readonly string[], files: readonly ExecutedFile[], root: string): PathCoverage[];

export interface GateDecision { exitCode: number; lines: string[] }
export function decide(args: readonly string[], vitestExit: number | null, report: unknown, root: string): GateDecision;

/** Builds vitest's argv. Every flag in "--flag=value" form; the report path is always outside root. */
export function vitestArgv(args: readonly string[], reportPath: string): string[];
```

```ts
// src/tools/vitest-paths/raw-invocation.ts  (pure)
export interface RawInvocation { line: number; paths: string[] }
export function findRawMultiPathInvocations(text: string): RawInvocation[];
```

```ts
// src/tools/vitest-paths/cli.ts
export interface PathsCliDeps {
  root: string;
  exists: (p: string) => boolean;
  runVitest: (argv: string[]) => number | null;   // spawnSync(process.execPath, [vitestBin, ...argv], { stdio: "inherit", cwd: root }).status
  newReportPath: () => string;                     // under os.tmpdir(), unique per call
  readReport: (p: string) => unknown;              // JSON.parse, or undefined on any error
  removeReport: (p: string) => void;
}
export function dispatch(argv: readonly string[], deps: PathsCliDeps): GateDecision;
```

Every input each requirement needs is reachable from the object that must
satisfy it: `decide` receives the argument list AND the report AND vitest's exit
code, which is everything per-argument coverage needs (the failure the brief
recorded - a requirement whose function could not receive its input - does not
occur); `matchesArg` receives `root` because vitest's rule needs the
root-relative form.

---

## 5. The surface: routing and enforcement

### 5.1 Documents (layer 4) - what each gains, stated as a fact to pin

- **`docs/loop/this-repo.md`, section 1.** A new subsection after the gate
  table and BEFORE `### The build gate does not exit 0` (`:26`): "Running a named
  set of test files". It states the defect in one sentence with the c1 numbers,
  names `npm run test:paths` as the only form for two or more paths, says a
  single path may still use `npx vitest run <path>` (loud by c2), and says the
  wrapper takes no flags. Placement matters: `src/loop-docs.structure.test.ts:248-252`
  anchors on `The four lint warnings are the baseline` (`:61`),
  `SnapshotGradingPanel` and `## 2. Tests` (`:87`); inserting before `:26`
  moves none of their relative order.
- **`.claude/agents/loop-implementer.md`**, house rules (`:33-`): two or more
  test paths run only through `npm run test:paths`; **if a brief spells a raw
  multi-path `vitest run`, run the wrapper instead and say so in the report** -
  this is the choke point for the off-tree briefs (2.3).
- **`.claude/agents/loop-plan.md:81`** ("The gate for each wave, naming the exact
  commands"): multi-path gates are spelled with the wrapper.
- **`.claude/agents/loop-test-author.md`**, "What your artifact must contain"
  (`:119-`): an instrument naming two or more test files is the wrapper.
- **`.claude/agents/loop-seat.md`**, "What your artifact must contain" (`:44-`):
  a verification report quotes the wrapper's per-path lines, not only vitest's
  summary.
- **`.claude/agents/loop-checker.md:33`** (silent-green): ask whether any gate
  in the artifact runs two or more paths without the wrapper.
- **`docs/loop/traps-tests.md`**: one entry, with its instance, for the silent
  drop, and one for 1.6 (an optional-value flag swallowing a test path). These
  entries must DESCRIBE the command, not paste a raw two-path invocation - the
  enforcer below scans this card at zero.

`docs/DEV_LOOP.md` is NOT edited: it defers gate commands to `this-repo.md`
("It does not restate the other cards").

### 5.2 The structure test (layer 5)

`src/tools/vitest-paths/gate-commands.structure.test.ts`. Detector:
`findRawMultiPathInvocations`, whose behaviour is fixed by the 19 canary cases
of section 2.1 (they become its unit test, `raw-invocation.test.ts`).

**Scope, chosen by what a file IS, not by where it happens to be:**

| Scope | Files | Rule | Why this scope |
|---|---|---|---|
| S1 | `.claude/agents/*.md` (8 today; `ls .claude/agents`) | **zero** | gate instructions to every tier |
| S2 | `docs/DEV_LOOP.md`, `docs/loop/*.md` (10 today; `ls docs/loop/*.md \| wc -l`) | **zero** | the loop's own cards |
| S3 | `AGENTS.md`, `CLAUDE.md` | **zero** | load into every session |
| S4 | every value of `package.json` `scripts` | **zero** | the scripts are gates |
| S5 | `.github/workflows/*.yml` | **zero** | CI gates, none today |
| S6 | every non-null `verify` in `docs/backlog.yml`, read with `parseBacklogYaml` | **zero** - and this is the single-path ruling's enforcer (section 8) | only the `verify` field is a gate; `title`/`note`/`instrument` legitimately QUOTE the repro, so they are not scanned |
| S7 | every `src/**` file that imports `node:child_process` or `child_process` (1 today, `closure-runner.ts`; 2 more after this wave, `cli.ts` and the e2e test) | **zero** | a spawner is a gate runner wherever it lives - scoped by construction, not by a directory list |
| S8 | every `docs/**/*.md` except `docs/BACKLOG.md`, which is generated from `docs/backlog.yml` and covered by S6 | **ratchet**: a frozen map `file -> max count`; a file absent from the map must be 0; a listed file may shrink but never grow | per-item design documents are where gate commands are actually written today (section 2.2); history cannot be rewritten, but the NEXT plan must not add one |

S1-S5 and S7 overlap S8 only in S2 (`docs/loop/*.md`, `docs/DEV_LOOP.md` are
also under `docs/`): they are held at zero by S2 and must NOT appear in the S8
map.

**The S8 map is populated from the implementer's own run of the detector at
build time, not from this document** - three of the listed files are being
edited by A16 now. Orientation only (my census, section 2.2, plus this file):
`REGRESSION.md` 2, `a11-scope.md` 1, `a16-plan.md` 2, `a18-ac.md` 1,
`a18-test-notes.md` 1, `a19-scope.md` 1, `a20-scope.md` 1, `a22-scope.md` 1,
`a23-criteria.md` 2, `a23-test-notes.md` 1, `l14-scope.md` 3 (the literal
PowerShell repro in 1.1, the JSON-reporter run in 1.4, and sabotage X5 in 9.1 -
measured by running the prototype detector over this file after writing it).

**What it deliberately does NOT fire on:** a single-path run anywhere; prose
mentioning vitest (`vitest runs in ...`, "a multi-path `vitest run` silently
drops ..."); placeholders (`<WS-2>`); the wrapper command; comments in ordinary
`src/**` files (outside S7), which the census shows are all single-path records.

**Self-reference.** The structure test and the detector's unit test contain
multi-path fixtures. They must be BUILT at runtime from separate words -
`["npx", "vitest", "run", "src/a.test.ts", "src/b.test.ts"].join(" ")` - never
written as a literal, and never as `"npx vitest run"` plus paths, because the
detector's own tokenizer reads straight through a closing quote and FIRES on
that spelling (checked by running the prototype detector over both spellings;
section 13 records the result). So no exclusion list exists to rot, and the e2e
test (which imports `child_process` and is therefore in S7) is scanned like any
other spawner.

**Canary block, required before the real scan** (`traps-search.md`, first rule):
the detector fires on the c1 fixture; each scope set S1, S2, S4, S6, S7, S8 is
non-empty (S6 non-empty means `parseBacklogYaml` returned rows, even though all
`verify` values are null today - so the canary for S6 is a fixture row with a
two-path `verify`, fed through the same predicate); and S1's glob returns
`loop-implementer.md` by name, proving the dot-directory was actually read.

**The surface-is-named assertions** (these are what stop the routing from being
deleted later without anyone noticing - the recorded "only enforcer deleted"
failure):

- `package.json` has a `test:paths` script, and the `.ts` path in it exists on
  disk.
- `docs/loop/this-repo.md` and `.claude/agents/loop-implementer.md` each contain
  the string `test:paths`. Pinned as a FACT (the script name appears), never a
  sentence (`traps-tests.md`, source-text tests over-specify).

---

## 6. L15 - the fix must not collide with it

L15 is a load-sensitive false RED under vitest's unconfigured 5-second default
(`grep -n testTimeout vitest.config.ts` returns nothing; the `test:` block at `vitest.config.ts:27-40`
sets only `include`, `environment`, `setupFiles`, `env`). The design is shaped
around it in five places:

1. **One vitest process per wrapper call**, never one per path (option F was
   rejected for this reason): the wrapper adds no load compared with the raw
   command it replaces.
2. **The wrapper passes no `--testTimeout` and sets no kill timer on its child.**
   Whatever L15 settles in `vitest.config.ts` applies unchanged; a wrapper-level
   timer would be a new load-sensitive false RED of exactly L15's kind.
3. **The e2e test spawns real vitest, so it IS L15's class.** Every `it` in it
   carries an explicit `30_000` timeout, the `closure-runner.test.ts:41` idiom.
4. **The structure test is a whole-tree walker** over `docs/**/*.md` - 146
   tracked files, 7,619,744 bytes (`git ls-files docs | grep -c "\.md$"`;
   `git ls-files docs | grep "\.md$" | xargs cat | wc -c`) - plus S1-S7. It must
   read each file ONCE at module scope (L15's option c) and give every `it` an
   explicit timeout (option b). For scale: the prototype census read all 2850
   candidate files in 0.829s wall (`time node census2.mjs`), unloaded.
5. **It ENLARGES L15's walker set by one**, and that must be written into L15's
   row: `grep -rlE "readdirSync|walkTsxFiles" --include=*.test.ts src | wc -l`
   returns **38** today, not the 32 the L15 row records - the row's own count is
   already stale by 6 before this design adds anything (R9).

A false RED from L15 inside a wrapper run arrives as a non-zero vitest exit,
which the wrapper propagates (3.2 step 4). The wrapper can neither create nor
hide one.

---

## 7. The wave

**ONE wave.** The tool and its surface ship together: a wave that shipped
layers 1-3 without layers 4-5 would be a wrapper nobody is told to call, green
on every gate - the recorded failure this seat is warned about. There is no
split that leaves an independently gateable, reachable half.

### 7.1 Write set (the `owns` list)

| Path | New / edited | Estimate |
|---|---|---|
| `src/tools/vitest-paths/paths-gate.ts` | new | ~120 lines |
| `src/tools/vitest-paths/paths-gate.test.ts` | new | ~170 |
| `src/tools/vitest-paths/raw-invocation.ts` | new | ~110 |
| `src/tools/vitest-paths/raw-invocation.test.ts` | new | ~90 |
| `src/tools/vitest-paths/cli.ts` | new | ~90 |
| `src/tools/vitest-paths/cli.e2e.test.ts` | new | ~80 |
| `src/tools/vitest-paths/gate-commands.structure.test.ts` | new | ~170 |
| `package.json` | edited: one `scripts` entry | +1 |
| `docs/loop/this-repo.md` | edited: section 1 subsection | +12 to +18 (307 today, `wc -l`) |
| `docs/loop/traps-tests.md` | edited: two entries | +15 to +25 (77 today, `wc -l`) |
| `.claude/agents/loop-implementer.md` | edited | +4 (58 today) |
| `.claude/agents/loop-plan.md` | edited | +2 (84) |
| `.claude/agents/loop-test-author.md` | edited | +2 (129) |
| `.claude/agents/loop-seat.md` | edited | +2 (55) |
| `.claude/agents/loop-checker.md` | edited | +2 (64) |

(`wc -l .claude/agents/*.md docs/loop/traps-tests.md docs/loop/this-repo.md`.)
No file approaches the 1000-line ceiling, which applies to `src/` only
(`this-repo.md` section 3).

**Nothing in `docs/backlog.yml` / `docs/BACKLOG.md`.** Closing L14 and filing
the residuals of section 12 is the orchestrator's at disposal; if the
implementer wrote the backlog, `backlog-file.structure.test.ts:60`
(`EXPECTED_ROW_COUNT = 43`) would join the write set and the orchestrator could
not touch the backlog in that window (`DEV_LOOP.md`, standing rules).

### 7.2 Readers of the edited files AS SOURCE TEXT - derived, pasted

Command 1, files that read an edited doc, agent definition or `package.json` by
path:

```
$ grep -rnE "(readFileSync|readDoc|resolve|join)\([^)]*(this-repo\.md|traps-tests\.md|\.claude|package\.json|docs/loop)" --include=*.ts src
src/loop-docs.structure.test.ts:68:  const source = readDoc("docs/loop/iteration-caps.md");
src/loop-docs.structure.test.ts:96:  const source = readDoc("docs/loop/seats.md");
src/loop-docs.structure.test.ts:121:  const source = readDoc("docs/loop/seats.md");
src/loop-docs.structure.test.ts:144:  const leveragePath = path.join(REPO_ROOT, "docs/loop/leverage.md");
src/loop-docs.structure.test.ts:225:  const source = readDoc("docs/loop/parallel-disjointness.md");
src/loop-docs.structure.test.ts:248:  const source = readDoc("docs/loop/this-repo.md");
```

Canary for that shape: the same pattern with `DEV_LOOP` returns
`src/loop-docs.structure.test.ts:26` and `:51`, a known reader.

Command 2, tests that read the whole `docs/` tree:
`grep -rlE "\[\"src\", \"docs\"\]|\"docs\"\]" --include=*.test.ts src` returns
`src/lib/no-emojis.test.ts` (roots at `:243`) and `src/lib/live-class/links.test.ts`
(a false hit: a link fixture whose `kind` is `"docs"`).

Command 3, tests that walk `src/` and so read every new file:
`grep -rlE "readdirSync|walkTsxFiles" --include=*.test.ts src` - 38 files; the
ones rooted at `src/` include `file-size-ceiling.structure.test.ts`,
`source-bytes.structure.test.ts` (which skips `.claude`, `:38`, so it does not
read the agent definitions), `no-emojis.test.ts`,
`module-graph/runtime-import-graph.test.ts`, `use-server-exports.test.ts`,
`action-guard-coverage.test.ts`, `canvas-client-boundary*.test.ts`,
`client-state-sweep.registry.test.ts`, `session-diagnostic-log.test.ts`.

Classification:

| Reader | Class | Why |
|---|---|---|
| `src/loop-docs.structure.test.ts` | **checked-safe, run-only** | anchors at `:248-252` are `The four lint warnings are the baseline`, `SnapshotGradingPanel`, `## 2. Tests`; the insertion goes before `this-repo.md:26`, above all three |
| `src/lib/no-emojis.test.ts` | run-only | scans every new doc line; no emoji, and no vitest check or cross mark pasted (`traps-search.md`) |
| `src/source-bytes.structure.test.ts`, `src/file-size-ceiling.structure.test.ts` | run-only | new files must be text and under 1000 lines |
| the other 30+ `src/` walkers | run-only, covered by the full `npm test` in the gate | `src/tools/backlog/` is the precedent: a Node-only tool directory that imports `node:child_process` and `node:fs` already passes every one of them today |
| `src/tools/backlog/backlog-file.structure.test.ts` | run-only | the new test imports `parseBacklogYaml` from the same codec; nothing edits the codec |
| `src/tools/backlog/closure-runner.test.ts` | run-only | unchanged, and now in S7's scan |

**Disjointness with work in flight** (the brief's exclusions): the write set
contains nothing under `src/app/components/repo-grades/`,
`src/app/components/canvas-tab/`, or `src/app/actions/prompt-announcement-*`,
and none of those is a reader in 7.2. One shared resource no file list shows:
**S8 reads every `docs/**/*.md`, including documents other agents are writing.**
After this wave lands, an A16 or A23 author who writes a raw multi-path command
into a NEW document turns `npm test` red for everyone - which is the intended
behaviour, and should be said to those seats in the same push.

### 7.3 The wave gate

| Step | Command | Pass |
|---|---|---|
| 1 | `git status --short` | exactly the 15 paths of 7.1 changed or added, plus whatever was already dirty at start (record it), and no `.claude/worktrees` path |
| 2 | `npx vitest run src/tools/vitest-paths/` | green (a single directory argument is loud when it matches nothing, c4) |
| 3 | `npm run test:paths src/tools/vitest-paths/ src/loop-docs.structure.test.ts src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/file-size-ceiling.structure.test.ts` | exit 0 and five `COVERED` lines - the wave's own gate goes through its own surface |
| 4 | the same command with one path misspelled | **exit 1**, naming the misspelled path - the surface proven able to fail on the live tree |
| 5 | `npm test` | all green; file count = baseline + 4 new test files |
| 6 | `npx tsc --noEmit` (the ONE caller), `npm run lint` | no output / the baseline warning count |
| 7 | the sabotage passes of section 9 | each observed RED, then restored from a COPY (`sabotage-restore` memory: never `git checkout --` an uncommitted file) |

---

## 8. The single-path ruling for a row's `verify`

The L14 row records a ruling (2026-09-20, in its `note`): **a row's `verify` is
single-path, option (a)**, because a missing sole path is decidable by the
existing runner (`closure-runner.test.ts:34-41` exercises exactly that).

**This design keeps the ruling and does not re-open it.** What it adds: the
ruling has had NO mechanical enforcer - nothing in `src/tools/backlog/` or its
tests inspects a `verify` string's arguments (Grep `verify` over
`src/tools/backlog` minus tests: codec, types, cli, render, stop-guard and the
closure-runner comments; none counts paths). S6 becomes that enforcer. It also
makes the closure-runner's blindness (the row's second complaint,
`closure-runner.ts:31` reads only the `Tests` line) acceptable by construction:
the runner can never be handed a multi-path `verify` while S6 holds. Hence no
change to `TESTS_SUMMARY_RE` (option E).

**One fact the owner should have, stated without ruling on it:** the wrapper
makes a multi-path `verify` runner-decidable too - `npm run test:paths a b`
exits 1 on a dropped path - which removes the ruling's FIRST stated reason. Its
second ("forces the oracle for a chunk into one file") is untouched. Relaxing
the ruling is the owner's call; S6 enforces the ruling as it stands, and
relaxing it later is a one-predicate change in S6.

**Disposition of the row's three options:**

| Row option | Disposition | Where |
|---|---|---|
| (a) single-path `verify` | KEPT as ruled; gains enforcer S6 | 5.2, S6 |
| (b) compare the `Test Files` count to the path count | WITHDRAWN - wrong unit: w4 shows 2 arguments legitimately yield 14 files | 3.1 row B |
| (c) require `--reporter=json` and assert the collected file set | KEPT in generalised form, as the wrapper's mechanism for wave gates - not for `verify` | 3.2 |

---

## 9. Pass conditions

Each names the object compared, the instrument producing each quantity, and the
direction of failure.

| Id | Object | Instrument | Fails (RED) when |
|---|---|---|---|
| P1 | exit code of the SURFACE, `npm run test:paths src/lib/no-emojis.test.ts src/does-not-exist.test.ts` | `cli.e2e.test.ts` spawning the command read from `package.json` `scripts["test:paths"]`, 30 s timeout | the exit code is 0 |
| P2 | exit code and per-path lines for `src/lib/no-emojis.test.ts src/tools/backlog/ids.test.ts` | same | exit is non-zero, or either path is not reported COVERED - a wrapper that always fails is useless |
| P3 | exit code for `src/lib/no-emojis.test.ts docs/DEV_LOOP.md` (exists, never collected) | same | exit is 0 - the case an existence check alone passes (c11, w6) |
| P4 | whether vitest is spawned for arguments containing `-t` | `paths-gate.test.ts` on `dispatch` with a `runVitest` spy | the spy is called, or the exit code is 0 |
| P5 | the decision when vitest exits 0 but the report is missing or malformed | `paths-gate.test.ts` on `decide` with `report` = `undefined`, `{}` and `{ testResults: "x" }` | any of them yields exit 0 (fail-open) |
| P6 | per-argument attribution over the matrix of section 1.1 and 3.4 | `paths-gate.test.ts`: `coverageOf` over reports CONSTRUCTED in the measured shape (absolute forward-slash `name`, `assertionResults[].status`) - file with and without `./`, backslash form, directory with and without trailing slash, upper-case letters, absolute path, a path matching only all-skipped files | any row's `covered` differs from the measured table (the skipped-only row must be NOT covered) |
| P7 | vitest's argv as built | `paths-gate.test.ts` on `vitestArgv` | any element is exactly `--json` or `--outputFile`, or any `--outputFile...=` value lies inside `root`, or the paths do not come last in the given order |
| P8 | a propagated RED | `paths-gate.test.ts` on `decide` with `vitestExit` 1 and an all-covered report | the exit code is 0 |
| P9 | the detector's verdicts | `raw-invocation.test.ts`, the 19 canary cases of 2.1 as a table, each built at runtime | any case's hit count differs from the table |
| P10 | S1-S8 over the real tree | `gate-commands.structure.test.ts` | a zero-scope file has a hit; an S8 file exceeds its frozen count; an unlisted `docs/**/*.md` has a hit; a canary does not fire |
| P11 | the surface is named | same file | `scripts["test:paths"]` is missing, its `.ts` path does not exist, or `test:paths` is absent from `this-repo.md` or `loop-implementer.md` |

### 9.1 Sabotage (step 7 of the gate) - each must be observed RED

| Id | Mutation | Expected RED |
|---|---|---|
| X1 | in `decide`, treat an argument with zero matched files as covered | **P3 red** (the file exists, so only the post-check can catch it). P1 stays red through the pre-check - record that; it shows the two checks are independent |
| X2 | delete the existence pre-check and the flag refusal | **P4 red** (the `runVitest` spy is now called with `-t`). P1 stays red through the post-check - record that |
| X3 | drop the per-argument `passed > 0` requirement | P6's skipped-only row goes red |
| X4 | write the report path under `root` | P7 red |
| X5 | add `npx vitest run src/a.test.ts src/b.test.ts` as a line to a COPY-backed `.claude/agents/loop-implementer.md` | P10 red naming that file |
| X6 | the same line in a new `docs/l14-sabotage.md` | P10 red (unlisted S8 file) |
| X7 | the same with ONE path | P10 stays GREEN - the scope does not fire on single-path runs |
| X8 | rename `test:paths` in `package.json` | P11 red |
| X9 | put a two-path `verify` on one row of `docs/backlog.yml` (copy-backed; this edit also trips `backlog-file.structure.test.ts`'s render check, which is expected and must be named) | P10 red under S6 |

---

## 10. Leverage question

Asked, per `docs/loop/leverage.md`. **Trigger that fired: none - no claim is
owed.** L14 is `kind: bug` in `area: loop-and-docs-maintenance` (the row), and
the chunk changes no capability an app user reaches; `DEV_LOOP.md`'s Criteria
paragraph exempts "a bug fix, a refactor, a doc correction". The wrapper's user
is the loop itself. The three-way call (redesign / accept / reject) is therefore
not owed, and I am not defaulting it.

---

## 11. Seat triage for this chunk

| Seat | Runs? | Trigger |
|---|---|---|
| Acceptance criteria | yes | always; the chunk changes `src/` and `package.json`, so the docs-only exemption does not apply |
| Architect | this document | new directory, more than two existing files |
| Reliability | **yes** | a temporary file that must be released, a child process, and fail-closed behaviour on a missing report - failure modes that are not thrown errors |
| Security | no - trigger not fired | no server action, no network egress, no user or model text reaching a prompt or the DOM, no credential path; the child process takes no shell (3.2 step 3) |
| External-facts research | fired, discharged here | the plan rests on vitest 4.1.9's behaviour, measured directly in section 1 against the installed package |
| Baseline | **yes** | `grep -ac "closure-runner\|vitest-paths\|test:paths" docs/REGRESSION.md` returns 0 - gate tooling has no regression entry. The matrix of 1.1 is the behaviour to baseline |
| User experience, Visual, Accessibility | no - trigger not fired | no surface a user sees, clicks or hears |
| Data / storage | no - trigger not fired | nothing persisted; the report lives in `os.tmpdir()` for one call |
| Operability | no - trigger not fired | nothing an owner configures |
| Test seat | yes | always |

---

## 12. Residual register

Each names an owner, an instrument, and the step that will measure it. **None of
them is in `docs/BACKLOG.md` yet** - filing them is the orchestrator's at this
design's disposal (7.1 explains why the implementer must not), and until filed
they do not exist.

| Id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| R1 | Orchestrator briefs are off-tree; nothing here can scan them. Mitigated at the execution choke point (`loop-implementer.md` converts a raw multi-path gate and reports it) and the check point (`loop-checker.md`) | orchestrator; the checker of every wave | the implementer's report quoting the command it actually ran, read by the Verify seat | Verify of every wave after this lands |
| R2 | Live raw multi-path INSTRUMENTS in open items: `a19-scope.md:945` (A19), `a22-scope.md:1443` (A22), `a23-criteria.md:513,623` and `a23-test-notes.md:1297` (A23) | each item's next plan or test seat | S8's count for those files dropping (the ratchet lets it) | that item's next revision round; orchestrator appends one line to each row's `note` |
| R3 | `closure-runner.ts:31` stays blind to file counts; acceptable only while every `verify` is single-path | this chunk's S6 | P10 under S6 | every `npm test` |
| R4 | `runVerify` still has zero production callers, so a `verify` string is documentation, not an executing gate (the row's own open question) | orchestrator - decide whether a backlog item gives it a caller | `grep -rn "runVerify" src` | the next backlog-automation item; needs its own row |
| R5 | From PowerShell, `npm test -- <path> -t <name>` delivers the name as a path filter (1.5). The wrapper refuses flags; the raw command is untouched | this chunk's implementer, as a `traps-tests.md` entry | none mechanical - a documented hazard, and the entry says so | this wave |
| R6 | S8's ratchet permits shrink-then-regrow within one file (the `ALLOWED_OVERAGE` precedent's same slack) | accepted limit, stated | P10 | - (an accepted limit; if the owner wants equality, S8 becomes exact and every conversion in R2 must also edit the test) |
| R7 | The detector counts only PATH-SHAPED arguments; a raw multi-argument run of bare substrings (`npx vitest run foo bar`) is not caught statically. The wrapper refuses it at runtime (existence check) | accepted limit, stated | P9's table | - |
| R8 | Baseline of gate-tooling behaviour absent from `REGRESSION.md` | baseline seat | `grep -ac "test:paths" docs/REGRESSION.md` > 0 | before hand-off |
| R9 | L15's walker count is stale (the row says 32; `grep -rlE "readdirSync\|walkTsxFiles" --include=*.test.ts src \| wc -l` = 38 today) and this chunk adds one walker and one spawner | orchestrator, into L15's row | that grep | L15's scoping |
| R10 | The window in which `src/lib/no-emojis.test.ts` was two bytes (1.6): any gate result in that window over that file or the full suite is suspect | orchestrator | the mtime / restore times in 1.6 against any agent report timestamped 2026-09-21 near 08:31 | immediately, before trusting any red from that window |

---

## 13. What I could not determine

- **The owner's runtime for `npm run test:paths`** - timed only the direct node
  form (3.3).
- **Why the PowerShell hashtable matrix disagreed** (1.1), and **whether
  PowerShell or npm consumed `--`** (1.5). Outcomes measured; mechanisms not.
- **The unquoted-glob case in Bash** (1.2).
- **Whether the S8 counts in section 5.2 still hold at build time** - A16 is
  editing docs now. The implementer measures them.
- **Nothing about this file's own S8 count is undetermined**, recorded here
  because 5.2 points here: the prototype detector over this file reports 3 hits
  (1.1, 1.4, 9.1), and over the two fixture spellings of 5.2 it reports 1 hit
  for `"npx vitest run"` plus paths and 0 for separate words
  (`selfcheck.mjs` in the scratchpad). If a later edit to this file adds or
  removes an invocation, the implementer's own census is the number to freeze.
- **No component is rendered by any test here**, and none is involved: this
  chunk has no UI, so the ceiling costs it nothing - stated so no one infers
  otherwise.
