# L12 scope - the 1000-line ceiling versus growing canary files

Seat: loop-seat (scope / recon only). Recon at HEAD c770211e-era working tree, 2026-10-04. Read-only: no `src/` or
loop-doc file was edited; no `tsc` run. Every quantity names its command or `file:line`; anything not measured is
labelled READING.

## 0. Recommendation, up front

**DOC RULE, two edited lines, no code change. Close reading (b) WONT-DO. Do not build a mechanical enforcer now.**

| Reading | Decision | Why in one line |
|---|---|---|
| (a) ceiling test in every wave gate | DO, as a doc rule with NO trigger ("always"), in two places (section 5) | One run already covers the whole tree and costs about 0.55s; the only gap is who runs it |
| (b) one guard file per guarded component | WONT-DO | It does not close the class - a non-canary file can breach too - and the row's own note says it would have cut the 25ffe9c split worse |
| Mechanical enforcement (script, meta-test) | NOT NOW; residual R1 with a named trigger | No existing place can see a wave gate's membership (section 4); building one is a new instrument for a 2-line problem |

Confidence: high on the facts, moderate on "prose is enough" (the repo has a record of prose rules failing, section 4.3).

## 1. Corrections to the brief and to the row (read first)

1. **The brief assumes the pre-push gate backstops the ceiling. It does not.** `docs/loop/this-repo.md:30-40` ("The
   pre-push gate runs NO vitest"): the push gate is lint + tsc + build compile-line. The ceiling test is a vitest file,
   so at push it is not run. Further, no CI workflow runs vitest: `ls .github/workflows` returns
   `supabase-migrations.yml`, `sweep-orphan-uploads.yml`, `unattended-runs.yml`, and
   `grep -ln "vitest\|npm test\|npm run test" .github/workflows/*` printed nothing. So the ceiling is enforced ONLY
   when somebody runs it or runs the full `npm test` (107.4s, `this-repo.md:27`, not re-measured here). The gap is
   therefore wider than "scoped wave gates": it is "any gate that does not name the file". The silent-red class is real.
2. **The row cites the wrong line.** `docs/backlog.yml:375` says `src/file-size-ceiling.structure.test.ts:30`;
   `grep -n "LIMIT = 1000" src/file-size-ceiling.structure.test.ts` returns `41:const LIMIT = 1000;`. `this-repo.md:164`
   already carries the correction. The row's instrument should be updated when it closes.
3. **The "pre-push gate" is a convention, not an installed hook.** `ls .git/hooks | grep -v sample` returned nothing and
   `git config core.hooksPath` returned empty. This is why there is no file to edit to add a step; any pre-push change
   is a change to what the orchestrator runs, which lives in docs and memory.

## 2. What the ceiling test scans (task item 1)

File: `src/file-size-ceiling.structure.test.ts` (151 lines). Facts, opened:

| Fact | Citation |
|---|---|
| `LIMIT = 1000` | `:41` |
| Walks `src/` RECURSIVELY, every `.ts`/`.tsx` except `.d.ts` | `listSourceFiles` `:101-111`, regex at `:106`; root `path.resolve(repoRoot, "src")` at `:115`; list built at `:116-118` |
| It is a walker, not an enumerated list: a new file is covered with no edit | same lines; `ALLOWED_OVERAGE` (`:75-92`) is an allowance, not a scan list |
| Excludes ONLY paths the recording gate owns: `RecordingTab.tsx`, `TabShell.tsx`, and DIRECT children of `src/app/components/recording/` | `:51-62`, applied at `:119` |
| Violation = `lineCount > limit`, so exactly 1000 passes | `:140` |
| Four ratcheted files above 1000 | `:75-92`: `lms-generation.test.ts` 1124, `lms-generation-refine.test.ts` 1069, `registry-helpers.assembleLectureFiles.test.ts` 1058, `bulkBarGroups.test.ts` 1026 |
| Own timeout raised to 30s (L15) | `:15` |
| Counter is `countLines` from `src/lib/count-lines.ts` (Get-Content semantics) | `:5`, `:136` |

**Answer: one run of this single file covers the whole `src/` tree.** The recording-owned files are covered instead by
`src/app/components/recording/recording-split.structure.test.ts` (`:58` RecordingTab, `:67` TabShell, `:76-91`
recording dir via non-recursive `fs.readdirSync`). A wave that touches `recording/` needs BOTH files in its gate; the
ceiling test alone does not look at them.

Blind spots, stated so nobody assumes more than exists (READING of `:106`, `:115`): only `src/`; only `.ts`/`.tsx`
(not `.css`, `.mjs`, `.md`, SQL); `.d.ts` skipped.

### 2.1 Cost

| Quantity | Value | Command |
|---|---|---|
| Ceiling test, vitest-reported | 3 tests, 554ms | `npx vitest run src/file-size-ceiling.structure.test.ts` (single path, so the raw form is legal per `this-repo.md:55-57`) |
| Same, wall clock | 2.1s | `time` on the same command |
| Full suite | 107.4s | `this-repo.md:27` (quoted, NOT re-measured) |
| Whole `*.structure.test.ts` set (38 files) | 22.4s wall, 38 passed, 614 tests | `find src -name "*.structure.test.ts" \| wc -l` = 38, then a raw multi-path vitest. **Timing only**: that raw form drops unmatched paths (`this-repo.md:44-50`), I did not use it for a coverage claim, and the 38 paths came from `find` so none was unmatched. |

The ceiling gate is about 0.5% of the full-suite cost. Including it is not a token or time question.

### 2.2 The wall is close right now (why this is not hypothetical)

Command: `find src -name '*.ts' -o -name '*.tsx'` filtered by `wc -l >= 950`, then the four nearest re-counted with
`@(Get-Content <f>).Count` (the mandated instrument; both agreed):

| Lines | File | Note |
|---|---|---|
| 1000 | `src/app/components/snapshot-grading/snapshot-grading.structure.test.ts` | zero headroom; one added line reds it. Not in `ALLOWED_OVERAGE` |
| 1000 | `src/app/components/grading-recording/GradingRecordingPanel.tsx` | zero headroom |
| 999 | `src/app/components/recording/useReplyRows.ts` | recording-split owns it, not the ceiling test |
| 999 | `src/lib/supabase/app-users.test.ts`, `src/app/url-state.test.ts` | `wc -l` only, not re-counted with Get-Content |
| 998 | `src/app/components/repo-grades/index.tsx` | re-counted |

(`wc -l` and `Get-Content` agreed on the four re-counted; the two 999 lines marked wc-only are not confirmed with the
mandated instrument.) Two non-allow-listed files sit at exactly the limit; the next wave to add a line to either is
red under the ceiling and green under every gate that omits it.

## 3. Reading (a): is it a real cheap fix? (task item 2)

Yes, with one qualifier. The failure the row records is a verify list, not the ceiling: `backlog.yml:377` point (3)
("A5's verify named five commands and the ceiling test was not among them"). Commit `25ffe9cc` ("split the wiring
canaries, fixing a ceiling I broke in d077556", `git log -1 --format="%h %s" 25ffe9c`) is the instance.

Qualifier: the standing member must be "always", not "when the wave adds lines to an existing file" (the row's
phrasing at `:377`). Reason: the trigger is a judgement made by whoever writes the gate list, which is the exact step
that omitted it. A wave that only CREATES a file, or edits a file the author thought was small, escapes a conditional
rule. At 0.55s there is nothing to save by making it conditional.

Second qualifier: if the wave writes anything under `src/app/components/recording/` or `RecordingTab.tsx` /
`TabShell.tsx`, `recording-split.structure.test.ts` must ride with it (section 2). That one is already named by the
`this-repo.md` section 3 table and by the retro note at `docs/retro-396e8f34-HEAD.md:165-170`.

## 4. Where a rule would live, and whether it can be mechanical (task item 2, continued)

### 4.1 Where the convention is defined today

| Place | What it says about gate membership |
|---|---|
| `.claude/agents/loop-plan.md:87` | The wave-plan seat writes "The gate for each wave, naming the exact commands". This is the AUTHOR of the gate list; `:88-89` already carries the wrapper-spelling rule. The natural home of an "always include" rule. |
| `docs/loop/this-repo.md:30-40` | States the push gate skips vitest and that a wave "must run them in the wave gate ... or enumerate them in the wave plan". Names the registration canaries, not the ceiling. |
| `docs/loop/this-repo.md:164` | Describes the ceiling gate (section 3 table). No statement that every gate carries it. |
| `docs/a16-plan.md:228` | One plan's "run-only gates" row lists the ceiling with `source-bytes`, `no-emojis` and others. A per-plan list, not a standing rule. |
| `docs/DEV_LOOP.md` | Does not name the ceiling. `grep -c "1000" docs/DEV_LOOP.md` is stated to return 0 by the test's own header (`src/file-size-ceiling.structure.test.ts:21-26`). Not re-run by me. |

So the convention is per-plan and author-remembered. 136 docs already name the ceiling
(`grep -c "file-size-ceiling" docs/*.md | grep -v ":0" | wc -l` = 136); the plans that did include it were the ones whose
authors remembered.

### 4.2 Why no existing mechanical place can enforce it

| Candidate | Why it cannot |
|---|---|
| The Stop hook / `npm run backlog:stop-guard` (`.claude/settings.json`) | Decides by backlog state only (`backlog:stop-guard` blocks when `selectNext` returns an actionable item, per `docs/backlog.yml` L16 instrument citing `stop-guard.ts:63-75`; READING, not re-opened). It never sees a wave gate. |
| A backlog row's `verify` field | `verify` is a required field (`src/tools/backlog/yaml-codec.ts:159`), but `src/tools/vitest-paths/gate-commands.structure.test.ts` header `:4-6` holds every family at zero paths-arguments in a row's `verify`. A "verify must list the ceiling" check would contradict that existing pin. |
| `gate-commands.structure.test.ts` | Scans docs for RAW multi-path commands (`:1-8`); has no notion of a gate's required members. |
| `npm run docs:gate` | Exists (`package.json`, runs `no-emojis`, `source-bytes`, `gate-commands`) and is exactly the "package the checks into one command, no judgement" pattern (`docs/loop/traps-spec.md:188`). But it is scoped to docs-touching commits; a docs commit cannot breach a `src/` ceiling, so adding the ceiling to it would not close this gap. |
| A new script, e.g. a `src` structural gate | Feasible, one `package.json` line, but it only helps if the gate author runs it, which is the same remembered step with a shorter spelling. It would also be a new surface for `gate-commands.structure.test.ts` P11 to account for (not checked; READING). |

Conclusion: a mechanical enforcer of gate-list membership does not exist and would be a new instrument, not an edit.

### 4.3 The honest risk with a doc rule

`backlog.yml` L11's note says prose failed five times in one day for a different rule. A doc rule here can fail the
same way. Two things make it cheaper to hold than that case: (1) it names one file and has no judgement in it ("always"),
and (2) the ceiling test is a failing test, so a miss costs one split, as 25ffe9c did, not a shipped defect. The
mechanism for detecting a recurrence is R1 below.

## 5. The exact edits (the whole change)

All doc/agent text; no `src/` file.

| # | File | Edit | Gate |
|---|---|---|---|
| E1 | `.claude/agents/loop-plan.md`, immediately after the gate bullet at `:87-89` | Add a bullet: "Every wave's gate includes `src/file-size-ceiling.structure.test.ts`, unconditionally, and also `src/app/components/recording/recording-split.structure.test.ts` when the write set touches `recording/`, `RecordingTab.tsx` or `TabShell.tsx`. The ceiling test walks all of `src/` (`:101-119`), runs in about 0.5s, and a gate list that omits it is how `25ffe9c` happened." (Spell any combined command with `npm run test:paths`.) | `npm run docs:gate` |
| E2 | `docs/loop/this-repo.md`, after `:40` (end of the "pre-push gate runs NO vitest" section) | Add one paragraph: the ceiling test is a STANDING member of every wave gate and every verify list, because no later step runs it (push gate skips vitest, no CI vitest); cite `:41` and the 0.55s cost. | `npm run docs:gate` |
| E3 | `docs/backlog.yml` L12 row (orchestrator's step, not this seat's) | Close L12; per `DEV_LOOP.md` "Closing an item DELETES it", name the discharging commit in the commit message. If R1 is kept, file it as its own row. | n/a |

Pass condition for E1/E2 (named per the seat contract): object = `.claude/agents/loop-plan.md` and
`docs/loop/this-repo.md` text; instrument = `npm run docs:gate` (wrapper over `no-emojis.test.ts`,
`source-bytes.structure.test.ts`, `gate-commands.structure.test.ts`, `package.json`); direction of failure = RED if
the added text contains an emoji, a control byte, or a raw multi-path test command. E1 must therefore not paste a raw
multi-path command. That gate cannot verify the rule is FOLLOWED; section 6 says what can.

## 6. What is NOT proven, and what would prove it

| Id | Not proven | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | That the doc rule actually gets followed (the rule has the failure mode of L11's prose) | orchestrator | For each of the next waves that touches `src/`: `grep -n "file-size-ceiling" <that wave's plan or verify doc>` must hit; `git log --oneline -i --grep="ceiling"` for any new "fix: ceiling I broke" commit | Each wave verify step; if one miss recurs after E1/E2 land, file the mechanical option (a `package.json` structural-gate script), not another card |
| R2 | The ceiling's two exact-1000 files (section 2.2) will be hit by a wave that does not know | the next A/N wave touching `GradingRecordingPanel.tsx` or `snapshot-grading.structure.test.ts` | `@(Get-Content <f>).Count` in PowerShell for each owned file, at plan time | The wave plan's headroom row (the `a16-wave2-verify.md:58` pattern: "ceiling headroom") |
| R3 | The two 999-line files marked wc-only in section 2.2 | loop-seat that next scopes `app-users.test.ts` or `url-state.test.ts` | `@(Get-Content <f>).Count` | That scope's file-size row |
| R4 | The retro's A2 (run all 38 structure tests before each group push; `docs/retro-396e8f34-HEAD.md:177-186`) is the strictly stronger fix and would subsume E1/E2. I found no backlog row for it, but did not open every `structure.test` hit in `backlog.yml` (output was truncated at 160 chars: `grep -n -i "structure.test" docs/backlog.yml`) | orchestrator | `grep -n -i "pre-push\|structure set" docs/backlog.yml` read in full | The next backlog reconcile |

R4 matters for scoping: if the owner wants A2, E1/E2 become unnecessary for the ceiling, but A2 is a larger decision
(about 22s per group push, section 2.1) and not L12's to make.

## 7. Reading (b), briefly (task item 3)

One guard file per guarded component. Not recommended:

- It does not close the silent-red class. The ceiling is repo-wide and a NON-canary file can breach it
  (section 2.2 lists non-test source files at 998-1000). The rule that closes the class is "the ceiling test is
  always run", which (a) provides and (b) does not.
- The row's own point (2), `backlog.yml:377`: the 25ffe9c split's seam (click-gating versus linking) only appeared
  once both waves existed; a convention written in advance "would have produced a different, probably worse, cut".
- Cost: touches many existing test files and every future plan's file lists (conflicts with `parallel-disjointness.md`
  owns-list arithmetic, READING), against a 2-line doc fix.
- What would flip it: evidence of a canary file hitting the wall AFTER E1/E2 landed with the ceiling test in the gate,
  which would show the gate works and the file is simply too coupled. Then split-when-a-seam-appears (the row's
  point (2)), still not a convention.

The row's point (1) (is the ceiling itself wrong for canaries) needs no change: `ALLOWED_OVERAGE` already exists as a
ratchet (`:64-74` comment: "Never raise a maxLines"), and the row correctly warns that an exemption removes the
pressure behind two good splits. Recommend leaving it as is.

## 8. The one decision for the owner, shaped so every answer terminates

"L12 closes as a doc rule (E1, E2). Do you want, in addition, the stronger retro A2 (all structure tests before each
group push, about 22s)? YES: file A2 as its own row and L12 still closes on E1/E2. NO: L12 closes on E1/E2 and R1
watches for recurrence." Either answer ends this activity; neither reopens (b).

## 9. Commands run this session (provenance)

`grep -n -A14 "id: 'L12'" docs/backlog.yml`; Read of `src/file-size-ceiling.structure.test.ts`, `docs/DEV_LOOP.md`,
`docs/loop/this-repo.md:1-110, 140-190`, `.claude/agents/loop-plan.md:80-92`; `ls .github/workflows`; `ls .git/hooks`;
`git config core.hooksPath`; `npx vitest run src/file-size-ceiling.structure.test.ts` (3 passed); the 38-file raw run
(timing only); `wc -l` scan for >= 950 lines; `@(Get-Content).Count` on four files; `git log -1 --format="%h %s" 25ffe9c`.
After writing this file: `npm run docs:gate` -> `COVERED` for `no-emojis.test.ts` (18), `source-bytes.structure.test.ts` (3),
`gate-commands.structure.test.ts` (28), so this document itself holds no emoji, control byte or raw multi-path command.
Not run: `tsc`, `npm test`.
