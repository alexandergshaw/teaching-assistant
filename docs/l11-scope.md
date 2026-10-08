# L11 scope - make the owns-list caller check mechanical

Recon at HEAD `368de2a1` (`git rev-parse --short HEAD`), 2026-10-04. Read-only: the only file
written in the repo is this one. Recommendation up front: **WONT-DO a mechanical gate; no new
doc card either.** Reasons and evidence follow; what could not be determined is in section 6.

## 1. The row, and its three questions verbatim

Row: `docs/backlog.yml:355-366` (`id: 'L11'`, `state: 'unscoped'`, `owns: []`). Proposal in
its note: the wave gate "runs the grep the card describes and diffs it against the submitted
owns list". The three questions the note says must be settled first (`backlog.yml:365`):

- (1) "WHAT TO GREP FOR. A change to a function has a symbol; a change to a type, a prop, a
  CSS class or a string constant has a different one, and some have none an implementer could
  name."
- (2) "FALSE POSITIVES ARE THE WHOLE RISK. Every caller of a widely-used symbol would be
  flagged ... Something has to distinguish 'reached by this change' from 'merely mentions the
  symbol', and that judgement may not be mechanisable - in which case the honest answer is a
  gate that REPORTS the hits for a human to classify rather than one that passes or fails."
- (3) "WHERE IT LIVES. ... a wave-gate check is not obviously [a vitest file], since it is
  about a brief rather than about the tree. It may be a script the orchestrator runs, which
  makes it exactly as skippable as the card - and if so, say that out loud".

(The task framing said "new exported symbol has a caller"; the row's actual proposal is
different: diff the grep of a CHANGED symbol against the owns list. I answer both, because
they are different checks with different yields - section 3.)

## 2. What the project already has for this class (read at HEAD)

The rule is already stated at five placements; L10's own note says a sixth card is not the fix
(`backlog.yml:359`).

| Placement | Citation |
|---|---|
| Owns-list procedure: grep the symbol and module path, ask per hit whether the change reaches it | `docs/loop/parallel-disjointness.md:38-44`; failure signature "a missing caller is never a red test" `:46-52` |
| Architect seat: every wave contains the caller of each new export; checker asks "Name the wave that does not" | `docs/loop/seats.md:160-164`, `:172` |
| Plan seat: same rule plus the layer-spanning "surface->driver hop" write-set line | `.claude/agents/loop-plan.md:41-44`, `:45-50` (the second bullet was added today by retro AI4, commit `36831e0d`) |
| Verify-reachability trap | `docs/loop/traps-spec.md:53-64` |
| Core loop: "every wave includes the file that CALLS each new export" | `docs/DEV_LOOP.md:166` |
| Sequencing ruling when caller rule and disjointness collide | `docs/loop/parallel-disjointness.md:185-212` (Ruling 96) |

Not stated anywhere: an executing check. `package.json` has no knip/ts-prune/madge (checked:
`ls node_modules/.bin | grep -iE "knip|ts-prune|ts-unused|madge|depcheck"` returned nothing;
`grep -n noUnused tsconfig.json` returned nothing). `src/tools/symbol-count/count.ts` (AST
occurrence counter, Ruling 135) and `src/lib/module-graph/runtime-import-graph.ts`
(`scanRuntimeEdges`, `:44`) exist and are reusable building blocks, but neither is wired to
owns lists. There is no wave-gate script: the wave gate is an orchestrator procedure
(`this-repo.md` gate table, `DEV_LOOP.md:169-171`), and `npm run backlog:wave` only selects
disjoint backlog items (`src/tools/backlog/wave.ts`, cli.ts:229-237), it does not read a diff.

## 3. The three questions answered

### (1) What to grep for

Split by which check is meant, because the evidence differs sharply.

**Check A - "every NEW exported symbol has a non-test caller" (the task framing).**
Grep-able: `^export (async )?(function|const|class) Name`, then name occurrences in other
non-test files. But it does NOT match the L10 instances. L10's five instances
(`git show d866d331 -- docs/BACKLOG.md`, row L10): A1 and A2 omitted `AskAiModal.tsx`, "the sole
caller that had to pass the new option" - a new OPTION on an existing, already-called function,
so the function has callers and Check A passes; N15 omitted eleven files incl. a barrel and
`src/lib/grade/types.ts` - callers of CHANGED symbols, not new exports; A5 omitted three
fixture files that "must be touched to keep compiling" - `tsc` catches that at the wave gate
(`parallel-disjointness.md:50-52`). The fifth instance named in the L10 note (A5 index.tsx,
`backlog.yml:363`) I could not open the detail of; flagged in section 6. Of the four I could
read, Check A would have caught 0 of 4.

**Check B - "grep every CHANGED symbol, list referencing files not in the owns list" (the
row's actual proposal).** This is what would have caught N15 and the stale fixtures, and it is
exactly the procedure `parallel-disjointness.md:38-44` already prescribes. Grep target by
change kind: named export/type/prop -> its identifier (AST via `symbol-count/count.ts`);
CSS class -> the class string in `*.module.css` plus `styles.x` uses; string constant ->
literal text. "Some have none an implementer could name" is real, and the A1/A2 shape (a new
optional option nobody is forced to pass) has no symbol whose absence is detectable: the
caller is unmodified and therefore absent from every diff.

### (2) False positives

Measured at HEAD with scratch scripts (identifier-set match per file, NOT AST; collisions on
common names inflate reference counts and undercount dead exports, so every figure is a bound).
Scripts: `<scratchpad>/deadexports.mjs`, `own.mjs`, `chk.mjs`, `fan.mjs` in
`C:\Users\alexa\AppData\Local\Temp\claude\C--Users-alexa-OneDrive-Documents-Projects-teaching-assistant\e8e96e62-aa3d-4508-b28a-354d4d297572\scratchpad\`
(run with `node <script> <args>` from the repo root; ~5s each).

| Quantity | Value | Produced by |
|---|---|---|
| src ts/tsx files; non-test | 2915; 1676 | `find src -type f \( -name "*.ts" -o -name "*.tsx" \) \| wc -l`, same minus `*.test.ts(x)` |
| Exports, all forms incl. types | 8836 | `deadexports.mjs . list` ("exports") |
| Value exports with zero reference in any OTHER non-test file | 778 (of which 632 referenced by a test) | same script |
| Of those 778: used inside their own file | 667 | `own.mjs` |
| Of those 778: declaration-only (nothing else in own file) | 111 (77 test-referenced, 34 with no test reference) | `own.mjs` |
| New value exports in last 80 commits (`HEAD~80..HEAD`, `git diff -U0 ... ':!*.test.ts' ':!*.test.tsx'`) | 33 | `chk.mjs` |
| Of those 33: zero other-prod reference AND declaration-only at HEAD | 0 | `chk.mjs` |
| Fan-out of value exports (other files referencing the name), declaration-form only, n=5486 | median 3, p90 9, p99 70; 525 (9.6%) have >=10 referencing files; 102 have >=40 | `fan.mjs` |

Reading, per check:

- **Check A has a tolerable flag rate but zero demonstrated yield and a structural blind
  spot.** On the last 80 commits it flags 0 of 33 new exports. The 34 declaration-only,
  zero-test-reference exports at HEAD are real dead code (spot-checked via grep:
  `useSupabaseUser` at `src/hooks/useSupabaseUser.ts:5`, `savePresentationDraftAction` at
  `src/app/actions/media.ts:37`, `editSnapshotRowField` at `SnapshotResultCard.tsx:208`: each
  has no importer), but `git log --format="%h %s" -- src/hooks/useSupabaseUser.ts
  src/lib/card-layout.ts` lists only early feature commits (e.g. `294e6e4a` "integrate Supabase
  for authentication", `0fea1327`) and no recent wave, so this reads as a one-time census
  question, not evidence the current gate leaks (commit dates not checked). The
  dangerous shape - "helper + unit test, no production caller" - is indistinguishable from a
  legitimately test-exported pure helper: 77 declaration-only test-referenced exports at HEAD
  and 667 test-exported-but-used-in-own-file. Counting tests as callers makes the check useless
  for exactly that shape; excluding them forces an allow-list of ~111 frozen names that every
  intentional test-only export must join (churn). A diff-scoped version also false-flags the
  legal multi-wave case where the caller lands in a later wave under Ruling 96
  (`parallel-disjointness.md:201`).
- **Check B cries wolf on the minority that matter.** Median fan-out is 3, so most changes
  would produce a short, classifiable report; but 9.6% of exports (525) have >=10 referencing
  files and 102 (1.9%) have >=40 - the "forty-hit grep" the row fears. Those are the shared
  helpers where a missed caller is most expensive AND where a report is least readable. The
  row itself concedes the right form is report-not-gate (`backlog.yml:365`), and a report that
  needs a human to classify each hit is the existing grep step with a script around it.

Verdict on (2): tolerable only for Check A, which does not match the incident class; not
tolerable as a pass/fail for Check B. The reach judgement ("does this change reach this
caller") is semantic, as the row suspects.

### (3) Where it lives

| Candidate | Finding |
|---|---|
| Vitest structure test | Runs only if a gate list includes it. `this-repo.md` states the pre-push gate runs NO vitest and no CI workflow runs it (section "The pre-push gate runs NO vitest", and the L12 recon finding in `backlog.yml:377`). A whole-tree Check A test would need the ~111-name baseline above, and a diff-scoped test needs git state a vitest file does not have. |
| Orchestrator-run script / `npm run` command | Exactly as skippable as the card. Stating it out loud, per the row: this is the card with extra steps; the L10 history is five misses of a procedure the same agent knew. The only non-skippable form is a mechanical consumer (like `backlog:stop-guard`) - that would require extending `src/tools/backlog` to take a symbol list, a diff and an owns list: a new subsystem with its own tests and sabotage pass. |
| Wave-gate step (`git status --short` vs assignment) | The gate sees only files that CHANGED. A missed caller is by definition an unchanged file, so git status cannot see it (this is why the gate passes green). Adding a symbol grep here is the only placement that fires at the right moment, and it is the orchestrator's procedure, not code. |
| Pre-push | No vitest; lint + tsc + build compile-line (`this-repo.md`). tsc already covers the compile-forced half of the class (the A5 fixtures). |

## 4. Recommendation: WONT-DO (mechanical gate); no new doc rule

Disposal: **WONT-DO**, with a recurrence watch (residual R1).

Why this is the cheapest option that keeps quality:

1. **It buys nothing the existing layers do not already buy.** The compile-forced half
   (stale fixtures, changed signatures) is caught by `tsc` at the wave gate
   (`parallel-disjointness.md:50-52`; `tsc` has one caller, the wave gate). The "ships dead"
   half is caught at plan time (`loop-plan.md:41-50`), at architect-check time
   (`seats.md:172`) and at verify (`traps-spec.md:58-64`). L10 recorded each of its instances as
   "caught by a different agent at a different stage" (`backlog.yml:359`, L10 row text): the
   class is expensive in re-dispatch, not in shipped defects.
2. **The proxy that is cheap does not match the class** (Check A catches 0 of the 4 readable
   L10 instances; 0 hits in the last 80 commits). The check that would match (Check B) is the
   grep the card already prescribes, whose output still needs per-hit human judgement (9.6% of
   symbols with >=10 hits).
3. **The cost of building it exceeds what it would replace.** A mechanical consumer is a new
   tool under `src/tools/` (AST scan, diff-to-owns plumbing, tests, a sabotage pass, the
   any gate-command registration the repo requires - not checked), each wave then runs it
   and a human triages its report - the verify pass still runs regardless, since reachability
   from a UI control is not grep-able. That is net-added spend on every wave to save
   re-dispatch on a miss that is already caught downstream.
4. **A sixth doc card is also not warranted**: the rule is already at five placements and the
   plan seat was tightened today (`36831e0d`). Adding prose repeats the pattern L10 itself
   called insufficient.

Rejected alternatives and the reason: (i) per-wave dead-export script (Check A): zero yield,
wrong class, allow-list churn; (ii) Check B report in the gate: skippable, noisy on the 102
high-fan-out symbols; (iii) frozen-baseline vitest canary of the 111 declaration-only exports:
a ratchet that blocks legitimate test-exported helpers and does not run at push.

If the owner overrules and wants a mechanism anyway, the least-cost shape is a single
report-only `npm run` command wrapping `symbol-count/count.ts` for Check B, printing hits not
in the owns list, run by the wave-gate author; scope it as its own row with a test seat. I do
not recommend building it.

## 5. Disposition of the row and the edit it needs

No code, no doc edit by this scope. The orchestrator's edit is to the row only: set L11 to
WONT-DO citing this file, and file residuals R1 and R2 below. If the owner prefers a
different outcome, the question is shaped so every answer terminates (per `AGENTS.md`):
"Close L11 as WONT-DO (recommended), or scope the report-only Check B command as its own
row?"

## 6. Not determined / residual register

| ID | Not proven now | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | Whether the downstream layers keep catching the class after L10 (recurrence). This scope did not enumerate post-`38389877` commits for caller-miss instances: a `git log 38389877..HEAD --grep` returned 30 hits (826 commits in range) but the pattern is too broad to count instances honestly; I did not classify them. | orchestrator (the retro filing step, `DEV_LOOP.md:77-103`) | count of backlog rows / check findings naming a missed caller or dead export with a date after 2026-10-04 | the next `loop-retro` pass over a commit range after 2026-10-04: reopen L11 only if >=2 new instances reach main or the checker misses one the grep would have found |
| R2 | The 34 declaration-only, zero-test-reference exports (list in `own.mjs` output; examples above) are probably dead code, but the identifier-set match could be fooled by name collisions and by string/dynamic references (server-action names used as strings were not checked). | orchestrator (file as its own census row if the owner wants dead-code cleanup; this is not an L11 deliverable) | `src/tools/symbol-count/count.ts` AST run per name, confirmed by `grep -rn` | a dead-code-census row's own scope step, if filed |
| R3 | The detail of L10's fifth instance (A5 `index.tsx`, `backlog.yml:363`) was not opened; the "0 of 4" figure covers only the four readable in `d866d331`'s L10 row. | the checker of this scope | open `git show d866d331` L10 row / the A5 commits and classify index.tsx as caller-of-changed-symbol vs new-export | the check of this scope document |
| R4 | The fan-out and flag-rate figures are identifier-name matches, not AST reference resolution, and the 80-commit window is a single sample that includes docs-only commits. Direction of error: fan-out overstated, dead exports understated. | whoever reopens L11 | rerun with `src/tools/symbol-count/count.ts` over the same 33 names and the 525 high-fan-out names | only if L11 is reopened per R1 |

Environment limits (`docs/loop/this-repo.md` section 6 applies): nothing here exercises a
rendered component, a live database or the network; "reachable from a UI control" was assessed
by reading, not execution.
