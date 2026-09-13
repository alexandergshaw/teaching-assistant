# This repo: the measured facts

Every number here was produced by the command shown next to it, in this
checkout, on 2026-09-13. Re-measure rather than trusting the number if the tree
has moved on. **A measurement without its command is a rumour** - that rule
exists because two line-counting tools in this repo disagree by 42 on a single
file (see below), so "the file is 922 lines" is not a fact until you know which
tool said it.

Platform: Windows 10, `win32`. Two shells are available and they are NOT
interchangeable - see "Shell and PATH" below.

---

## 1. The gates

Run them from **PowerShell**. All four are repo-root commands.

| Gate | Command | Time | Passing looks like |
|---|---|---|---|
| Typecheck | `npx tsc --noEmit` | 10.2s | **No output at all**, exit 0. Any output is a failure. |
| Lint | `npm run lint` | 104.9s | `(cross-mark) 4 problems (0 errors, 4 warnings)`, exit 0 |
| Tests | `npm test` | 63.6s | `Test Files 1017 passed (1017)` / `Tests 20200 passed (20200)`, exit 0 |
| Build | `npm run build` | 66.6s | `(check-mark) Compiled successfully in 16.5s`, then **exit 1**. See below. |

### The build gate does not exit 0, and must not be expected to

`npm run build` compiles, then fails in the prerender tail:

```
(check-mark) Compiled successfully in 16.5s
  Collecting page data using 15 workers ...
  Generating static pages using 15 workers (7/28)
Error occurred prerendering page "/account/integrations"
Error: @supabase/ssr: Your project's URL and API key are required to create a Supabase client!
```

There is no `.env` file in this checkout (`ls -a | grep -i env` returns only
`next-env.d.ts`), so prerendering a page that constructs a Supabase client
cannot work locally. **The gate is the `(check-mark) Compiled successfully` line, not the
exit code.** Grep for it; do not `&&` on the build.

This matters because `next build` is the ONLY gate that catches two real
defects in this repo: a `"use server"` file exporting a non-async binding
(`src/lib/use-server-exports.test.ts` covers part of it, but only the part it
scans), and certain module-boundary errors. tsc, eslint and 20,200 tests all
pass on both.

### The four lint warnings are the baseline

`RecordingTab.tsx:347` (exhaustive-deps), `repoGradesSliceA.guards.test.ts:83`,
and two in `canvas-modules/new-quiz.test.ts`. Zero errors. A fifth warning is a
regression introduced by the current change; say so rather than letting the
count drift.

---

## 2. Tests

- **Framework:** vitest 4.1.9, `environment: "node"` (`vitest.config.ts`).
- **Collection:** `include: ["src/**/*.test.ts"]` - **`.test.tsx` is not
  collected.** 1017 files, 20,200 tests.
- **NO COMPONENT IS EVER RENDERED BY ANY TEST IN THIS REPO.** There is no
  jsdom, no testing-library, no render call. Every claim about markup, focus
  order, keyboard behaviour or ARIA comes from *reading source*, and a green
  suite proves nothing about any of it. This single fact shapes the whole
  architecture: logic that needs testing must live in a plain `.ts` leaf, never
  inline in a `.tsx`, or it cannot be tested at all.
- **Source-text tests** are therefore load-bearing here: 64 `*.wiring.test.ts`
  files and 12 `*.structure.test.ts` files assert things by reading source with
  `readFileSync`. They are the only mechanism that can check wiring.
- **The network is blocked.** `vitest.setup.ts` replaces `fetch` with a stub
  that throws. This exists because a sabotage check once stayed green for the
  wrong reason: the sabotage escaped a mock on `canvasFetch`, made a REAL
  request to a live Canvas host, and got back a 401 whose message matched what
  the test expected. Mock `canvasFetch`, not `fetch`, on Canvas paths. Known
  hole, stated in that file: `canvasFetch` dials `node:https`, not `fetch`, so
  a test mocking neither could still reach the network through it.
- **Supabase env is blanked** in `vitest.config.ts` so database code takes its
  in-repo fallbacks.
- **Concurrency:** `npm test` is safe to run concurrently - vitest writes no
  shared artefact. **`npx tsc --noEmit` is NOT.** `tsconfig.json` sets
  `"incremental": true`, so every run writes `tsconfig.tsbuildinfo` at the repo
  root (gitignored, `.gitignore:41`). Two agents typechecking at once race on
  that file. **Rule: exactly one caller runs `tsc`, and it is the wave gate.**
  Command that established this: `cat tsconfig.json`, `git check-ignore -v
  tsconfig.tsbuildinfo`.

---

## 3. Enforced structural limits - what turns an innocuous change red

Twelve `*.structure.test.ts` files (`find src -name "*.structure.test.ts"`).
These are the ones that catch a change that "should not have broken anything":

| Gate | Enforces |
|---|---|
| `src/file-size-ceiling.structure.test.ts` | **1000 lines, repo-wide over all of `src/`.** `LIMIT = 1000` at `:21`. Has an `ALLOWED_OVERAGE` ratchet: each entry is pinned to the file's count when the list was written, so a listed file may shrink but fails the moment it grows. Never raise a `maxLines` to fit a file that grew. |
| `src/app/components/recording/recording-split.structure.test.ts` | Scans `src/app/components/recording/` **non-recursively** plus `RecordingTab.tsx` and `TabShell.tsx` by name. Also holds hardcoded counts: exactly 12 sub-tab strip entries (`:132`), exactly 11 `role="tabpanel"` occurrences (`:187`), `panelTargets.size === 11` (`:219`), and a hardcoded view-restore list. Re-measured 2026-09-13 by `grep -n` on the test; the figures here were one low across all three after the snapshot-grading sub-tab landed. Adding a sub-tab breaks three of those and passes the fourth **falsely**. Also owns the `ta-rec-*` persisted-key ordinal canary as an exact-set assertion - which does NOT reach sibling directories (`useGradingRows.ts`'s three real `ta-rec-grade-*` keys are absent from its expected set), so adding a sibling key to that set FAILS it. |
| `src/source-bytes.structure.test.ts` | **Source files must stay text.** No BOM, no control bytes except TAB/LF/CR. Exists because a tool materialised a `\x00` escape as a literal NUL byte twice; the file then greps as binary and silently drops out of every source-text test, the emoji scan, and every search - while passing tsc, eslint, vitest and the build. |
| `src/supabase-migrations.structure.test.ts` | Migration SQL must be lexically well-formed. Exists because an undoubled apostrophe in a `comment on column` string reached production: migrations auto-apply from a GitHub Action on push to main, so the first sign was a red Action after the commit landed, with the TypeScript that depended on the schema already merged. |
| `src/lib/no-emojis.test.ts` | Owns the no-emoji policy **and its one authorized exception** (`CHECKLIST_DONE_PREFIX`, which the owner asked for explicitly). Pure JS regex, never shells out to grep. Do not hand-roll an emoji scan - see the search traps card for why. |
| `src/lib/use-server-exports.test.ts` | `"use server"` files export only async functions. |
| Feature structure tests | `caption-studio`, `message-replies`, `module-deck-capture`, `walkthrough-announcement`, `workflows/th-scope`, `canvas-pagination-guard`, `supabase/courses`, `workflows/registry`. |

**Two line-counting instruments disagree, measured on one real file:**

```powershell
$f="src/app/components/grading-recording/GradingRecordingPanel.tsx"
@(Get-Content $f).Count            # 964   <- the mandated measurement
(Get-Content $f | Measure-Object -Line).Lines   # 922   <- 42 lower, wrong
```

`wc -l < $f` from the Bash tool also gives 964. `src/lib/count-lines.ts` is the
in-repo implementation and matches `@(Get-Content).Count`; its header records
that `content.split("\n").length` is off by one on any file with a trailing
newline, which once failed a 1000-line file that was exactly at the wall.
**Use `@(Get-Content <file>).Count`. Never `Measure-Object -Line`.**

---

## 4. Regression cases

- `docs/REGRESSION.md`, 41,543 lines (`@(Get-Content docs/REGRESSION.md).Count`,
  2026-09-13), entries numbered to **412**.
- `grep -ac "^## " docs/REGRESSION.md` returns **366**, not 412 - the heading
  count and the entry count do not agree, so do not use one to infer the other.
  Find the next entry number by reading the tail, not by counting.
- **`grep -a` is required on this file.** It contains a raw NUL byte (from the
  first occurrence of the source-bytes defect, recorded as item 10), so plain
  `grep` classifies it as binary and reports nothing while exiting cleanly.
  That is a silent false-absence on the repo's own memory.
- No test reads `REGRESSION.md`; there is no integrity gate over it. Its
  accuracy is entirely a matter of discipline, which is why the baseline seat
  exists.

---

## 5. Shell and PATH

Both shells are available and each takes its own syntax.

- **PowerShell 5.1** is the primary. No `&&`, no `||`, no ternary, no `?.`.
  Chain with `A; if ($?) { B }`.
- **`bash` is NOT on PATH from PowerShell.** Verified:
  `bash -c "wc -l"` from PowerShell returns
  `The term 'bash' is not recognized`. The Bash tool is a separate Git Bash
  process and works fine on its own; you cannot shell out to it from
  PowerShell.
- **`grep -P` is broken here.** `grep -P "x" <file>` exits **2** with
  `grep: -P supports only unibyte and UTF-8 locales`. But
  `grep -P "\x{1F600}" <file>` exits **0** - i.e. a PCRE emoji scan reports
  "clean" without having checked anything. Never build a check on `grep -P`.
- Write commit message files with `[IO.File]::WriteAllText`, not
  `Set-Content -Encoding utf8`, which prepends a U+FEFF that lands in the
  commit subject.

---

## 6. What cannot be verified in this environment

State these rather than working around them:

- **No live database.** No `.env` file exists. Supabase env is blank under
  vitest by design and absent otherwise. Any claim about real query behaviour,
  RLS enforcement, or migration application is unverifiable here.
- **No API keys.** `GEMINI_API_KEY` and the rest are owner-set in Vercel. No
  claim about real model output can be verified locally; every LLM path is
  exercised only through mocks.
- **Migrations auto-apply** via a GitHub Action on push to main. There is no
  local apply step and no local SQL execution, which is exactly why
  `supabase-migrations.structure.test.ts` is lexical rather than semantic.
- **`gh` is not installed.** Verify Actions runs through the web UI or `curl`.
- **A browser is available** (the Browser pane), but the app cannot be
  meaningfully driven without env vars, so "I ran the app" is not a claim this
  environment supports for anything auth- or data-backed.
- **No component is rendered by any test.** Repeated here because it is the
  single most consequential limit: every UI, accessibility and keyboard claim
  in this repo is a reading claim.

---

## 7. Files held elsewhere right now

- A second git worktree exists at
  `.claude/worktrees/friendly-meninsky-8032bc`, detached at `8bc9c64`
  (`git worktree list`). **`Glob` returns the worktree copy of a path FIRST.**
  An agent can edit the worktree copy, pass every gate, and change nothing in
  the real tree. Require `git status --short` in the main checkout as proof of
  every wave.
- Working tree at the time of measurement: `docs/css-orphans.md` modified,
  `docs/snapshot-grading-acceptance-criteria.md` untracked. Neither was touched
  by the measurement commands.

---

## 8. Model tiers, mapped to this environment

The Agent tool's `model` field accepts `opus`, `sonnet`, `haiku`, `fable`.
Current IDs and first-party API rates, per the `claude-api` skill (cached
2026-06-24) - re-read that skill rather than quoting these from memory later:

| Agent | Model | ID | Input $/MTok | Output $/MTok |
|---|---|---|---|---|
| `loop-checker` | Claude Opus 5 | `claude-opus-5` | 5.00 | 25.00 |
| `loop-top` | Claude Opus 5 | `claude-opus-5` | 5.00 | 25.00 |
| `loop-seat` | Claude Sonnet 5 | `claude-sonnet-5` | 2.00 | 10.00 |
| `loop-implementer` | Claude Sonnet 5 | `claude-sonnet-5` | 2.00 | 10.00 |

Fable is not used at any tier.

**`.claude/agents/` is read at SESSION START, so a definition added or renamed
mid-session is NOT available until the session restarts.** Measured 2026-09-13:
after committing the four `loop-*` definitions, dispatching `loop-implementer`
returned `Agent type 'loop-implementer' not found`, listing only the built-ins.
Until a restart, dispatch `general-purpose` with an explicit `model` matching the
intended tier and point the brief at the definition file by path. This is the one
sanctioned use of a per-call `model` override, and it exists only because the
definition cannot be loaded - it is not a licence to re-tier a seat.

**Opus is exactly 2.5x Sonnet per token at ANY input/output mix** - 5 against 2
on input, 25 against 10 on output, both ratios 2.5. So this policy's cost can be
reasoned about without knowing any run's in/out split, which is useful because
the harness reports a single total per agent.

**Measured agent sizes in this repo**, from one feature's full run: design seats
102k-247k tokens each (median about 137k), implementer waves 148k-232k, checkers
133k-135k. Budget roughly 150k tokens per agent and about 10-14 agents for a
feature of this size.

**What the tier split costs and saves, measured on that run.** Six passes ran on
Opus for 1.04M tokens; seven on Sonnet for 0.93M. Moving the four authoring
passes among those six to Sonnet - keeping both checkers on Opus - moves 768k
tokens down a tier. At a 90/10 in/out blend that is $7.00/MTok against
$2.80/MTok, so about **$3.20 saved per feature of this size, roughly a third of
total agent spend**, with the adversarial checks untouched. The saving scales
linearly with how much authoring a feature needs.

**The rate limit binds before the dollars do.** A wave died mid-run against a
session limit during that same feature. Tier choice buys limit headroom as well
as money, and the headroom is what actually stops work.

**I could not confirm** whether the agent-definition frontmatter supports an
`effort` key in this build. The definitions in `.claude/agents/` therefore set
`model` (which IS honoured) and state the effort expectation in the body, where
it reaches the agent as instruction. If an `effort` frontmatter key is
confirmed later, move it out of the body.
