# The dev loop

How work gets built in this repo. This is the process actually in use, not an
aspiration - every rule below exists because skipping it cost something once.

The loop has twelve steps and **ends at the push**. There is no post-deploy visual
check (suspended 2026-07-26).

---

## 0. Standing consent

These do not need to be asked about, ever:

- **Dispatching disjoint file sets as concurrent subagents.** Assumed for every
  request big enough to split.
- **Committing and pushing to `main`** once the loop completes.
- **Starting the next backlog item** immediately after a push. A push is not a
  checkpoint. Say what you picked; do not ask permission to pick it.

While a backlog exists, forward motion beats confirmation.

---

## 1. Write the acceptance criteria first

`docs/<feature>-acceptance-criteria.md`, before any code. Numbered `AC1`,
`AC2`, ... so implementers and reviewers can cite them.

An AC is not a wish list. It fixes the things concurrent agents would otherwise
each invent differently:

- exact function signatures and return shapes (the "wire contract")
- exact parameter names sent to any external API
- exact error messages, where the wording is load-bearing
- which file owns what, so the split in step 6 is unambiguous

**Verified external facts go in the AC with their source and date**, quoted, so
no implementer re-derives them from memory and gets them subtly wrong.

## 2. Reuse survey

Read the codebase before writing the AC's implementation sections, and put a
vetted table of what already exists into the AC itself: `| Need | Reuse | Where |`
with file paths and line numbers.

This repo has a lot of near-miss precedent. The survey is what stops a seventh
filename sanitizer or a second upload-ticket type from being written.

## 3. Plan, research, revise until stable

Where the work touches an external API or an unfamiliar standard, verify the
details **before** hand-off. Guessing a parameter name and letting four agents
build on it wastes the whole wave.

Fold what you learn back into the AC, then re-read it. Iterate until it stops
changing.

## 4. A separate architect agent designs the implementation

Hand everything produced so far - the AC, the reuse survey, the research - to a
**fresh agent on the highest model available**, and have it do the architecting.
It pins the highest version explicitly; this is the one role in the loop that
does not take the lowest.

A separate agent, not the same context that wrote the plan. The point is a
reader who has only the documents, because that is exactly what the implementers
in step 6 will have. Anything the architect has to guess is something the AC
failed to say.

The architect returns the things the AC deliberately left open:

- the module and data-flow design, and where each new responsibility lives
- **the disjoint file split itself**, with the sibling boundaries named - this
  is what step 6 dispatches against
- the order of work, and which pieces are genuinely independent
- the trade-offs it rejected, and why, so step 8 does not relitigate them

Its output is folded back into the AC like step 3's research. If the
architecture contradicts the AC, the AC is wrong and gets fixed before anyone
writes code.

## 5. Baseline the area into `docs/REGRESSION.md` BEFORE hand-off

Skip only if the doc already covers that area.

The baseline records what the target surfaces do **today**, so a later
regression pass can tell a change from a coincidence. Write down the things that
would otherwise be assumed:

- what the surface actually is (a tab? a dropdown? a route?)
- whether a registry exists, or whether the list is literal JSX
- which conventions apply where (this repo has two different button
  vocabularies, and mixing them is the classic mistake)
- what is NOT tested, so a green suite is not mistaken for coverage

## 6. Dispatch concurrent subagents on disjoint file sets

**Disjoint is the whole discipline.** Every agent gets an explicit allow-list of
files and an explicit statement of which files belong to its siblings.

Each brief carries:

- the AC document, to be read IN FULL first
- its exact assigned files, and a refusal to touch anything else
- the specific existing files to READ first for idioms
- the critical points that have bitten this repo before
- the verification commands to run before reporting

Rules that are not negotiable in a brief:

- **Never `git stash`.** One agent's stash reverts every sibling's work.
- Concurrent dependencies are coded against the **AC contract**, not against
  files that may not exist on disk yet. If `tsc` reports a sibling's module
  missing, report it - do not create it or inline a copy.

## 7. Gate every wave with `git status --short`

Implementer agents can silently exceed their brief and then misreport. Compare
the working tree against the assignments before trusting a single report.

Spot-check the claims too. If an agent says it reused existing tokens, grep for
those tokens.

## 8. Verify: audit, then fix what the audit finds

Read what landed. The audit looks for what tests cannot:

- **Reachability.** Does the control actually render, are the props threaded,
  is the component mounted? A capability can pass every gate and ship dead.
- **The 1000-line ceiling** on every touched file. Split rather than exceed.
- **Whether an error's REASON survives.** Collapsing distinct failures into one
  indistinguishable state is the defect this loop catches most often.

Findings get fixed directly, and the AC is updated to match any contract change.

## 9. Tests, and they must be able to fail

Every new behaviour gets a test, and every test gets **sabotage-checked**: break
the behaviour, confirm the matching test goes red, restore, verify the restore.
Report which sabotages were run.

An untested-by-sabotage test is an assumption wearing a test's clothes.

Test-writing rules earned the hard way:

- **Pin the fact and the ordering, never the spelling.** Source-text assertions
  force contorted implementations.
- **Fixtures must match the shape the code actually emits.** A green suite
  proves nothing if every fixture uses a value shape the UI never produces.
- **A refactor disarms the test that compared two implementations.** After
  consolidating, pin against a frozen literal oracle instead.
- **Count canaries must be bumped in the same commit** that changes the count.
  When both a total and a sub-count move by one, that agreement is itself the
  proof the new member landed in the right bucket.

## 10. Review, research and repair - three agents, highest model

Before the regression pass the group's work goes through three **separate**
subagents, every one of them on the **highest model available** and pinned
explicitly. Separate contexts, not one agent wearing three hats: an agent that
found a problem is a poor judge of whether its own fix is sufficient, and an
agent that wrote a fix will not report that the fix was unnecessary.

**10a. The reviewer** reads the **whole group's diff**, with the AC and the
step 4 architecture in hand, and reports against them.

This is not step 8 repeated. Step 8 audits one wave's files while the context
that dispatched them is still warm. This reads every change the group made, at
once, with no memory of why any of it seemed reasonable at the time. Seams
between agents are only visible from here: the duplicate helper two siblings
each added, the contract that drifted on one side, the error path that is
handled in the lib and swallowed in the action. A change nobody can trace to an
AC line is either scope creep or a missing AC line, and both need saying.

The reviewer reports findings. It does not edit.

**10b. The researcher** runs **concurrently with the reviewer** - it needs the
diff's dependency surface, not the reviewer's opinion of it - and answers from
current sources rather than memory.

For every library, framework API and platform behaviour the diff touches, look
up the current guidance: this repo runs a Next.js whose conventions differ from
what any model was trained on, and `node_modules/next/dist/docs/` is the
authority over recollection. The same goes for the Canvas, Supabase and
provider APIs. Treat a deprecation notice as a finding.

Performance comes back on the same footing as correctness, on the paths that
actually run:

- work repeated per item that could be hoisted, and awaits placed in series
  that have no dependency between them
- a query per row where one query would do, and columns selected that nobody
  reads
- a payload or file read whole when it is consumed in pieces
- re-render and bundle cost on the client: what got pulled into a client
  component that could have stayed on the server

Every quoted fact carries **its source and the date it was checked**, exactly as
step 1 requires of the AC. Facts that outlive the review get promoted into the
AC.

Two limits, both learned:

- Do not relitigate a trade-off step 4 already rejected. New evidence reopens
  it; a preference does not.
- An optimisation with no measurement behind it and no reasoning about the real
  input size is a guess, and guesses are how the loop acquires complexity it
  cannot later remove. Say what the input size is, or leave the code alone.

The researcher reports findings. It does not edit either.

**10c. The fixer** receives both reports, merged and de-duplicated, and is the
only one of the three that touches the working tree. It gets the same brief
discipline as step 6: an explicit file list, and no `git stash`.

It has no authority to dismiss a finding. If a finding looks wrong, it says so
in its report and leaves the code as it was - a fixer that silently declines
turns a finding into a silence, and silence is indistinguishable from fixed.

Its changes are code like any other: they re-run the gates and each one needs a
test that can fail. Then the reviewer re-reads the fix diff and confirms each
finding is actually closed. A fix that touched anything outside the reported
findings goes round 10a and 10b again in full.

Findings are closed before the regression pass starts. Reviewing after
regression would only prove the review was too late to matter.

**The loop-back rule:** if the regression pass in step 11 causes **any** code to
change - a fix, a revert, a one-line adjustment - return here and run this step
again before re-running regression. No regression result counts unless the code
it ran against has been through this step. A fix written under the pressure of a
red regression is exactly the change most likely to break something else
quietly.

## 11. Regression pass, batched per group

A finished feature waits in a ready-queue. Each backlog group gets **one**
regression pass and **its own** push - never per-feature, never several groups
rolled together.

Failures get root-cause notes and a fix - and then the fix goes back through
step 10 before regression runs again. Repeat until 100 percent green on code
that has been reviewed in the state it was run in.

Then append the feature's own entry to `docs/REGRESSION.md`: what shipped, the
decisions worth re-reading, the gates with real numbers, and - the part that
matters most - the **Limits**. State plainly what was never run, never
rendered, and never observed. An entry that only lists successes is a trap for
the next session.

## 12. Push

Commit, push to `main`, and continue to the next item.

---

## Operational rules

**Gates, run from PowerShell** (Bash is unreliable on this machine):

```
npx tsc --noEmit
npx eslint <touched files>
npx vitest run
npx next build
```

- The pre-push build gate is the **compile line only**. `next build` fails on
  the env-dependent prerender tail locally (no Supabase keys); that failure is
  expected and is not a defect. What matters is "Compiled successfully".
- `next build` is the ONLY gate that catches a type re-export from a
  `"use server"` file, and the only one that catches a server-only import
  reaching a client bundle.
- Count file lines with `@(Get-Content path).Count`. Never
  `Measure-Object -Line`.
- Write commit messages via `[IO.File]::WriteAllText`. `Set-Content -Encoding utf8`
  puts a BOM in the commit subject.

**What the test suite does and does not prove:**

vitest here is node-env and collects only `src/**/*.test.ts`. **No component is
ever rendered.** Every UI, accessibility, markup and keyboard finding comes from
reading. A fully green suite proves nothing about what the screen looks like or
how it behaves under a keyboard - say so in the Limits rather than implying
coverage that does not exist.

**Repo invariants:**

- No emojis anywhere. `src/lib/no-emojis.test.ts` owns the rule and its single
  authorized exception. Never hand-roll an emoji scan; `grep -P` reports clean
  here without checking.
- Every new textbox, select or checkbox persists across reloads under a
  `ta-`-prefixed localStorage key.
- **Every feature that has a RUN has a downloadable log.** See the section
  below - this is a step 1 obligation, not a nice-to-have bolted on later.
- Server-action files may export **async functions and type-only declarations**
  (`export type`, `export interface`). They may NOT export a `const`, a
  synchronous `function`, or an `export { x } from "./y"` re-export - a
  re-export is illegal by FORM, because the compiler cannot see through it to
  prove the binding is async. `src/lib/use-server-exports.test.ts` enforces
  this under vitest, so this class no longer waits for `next build`.
  (Corrected 2026-08-31: this line previously read "only async functions",
  which sent an implementer to work around a restriction that does not exist.)
- Supabase typed selects collapse to `never` - map rows through an explicitly
  typed mapper.
- Migrations apply themselves via GitHub Actions on push to `main`. Verify the
  run; never instruct a manual apply.
- `gh` is not installed. Verify Actions runs via the web UI or `curl`.

**Model roles:** the step 4 architect and all three step 10 agents - reviewer,
researcher, fixer - take the **highest** model available. Sonnet implements and
Opus verifies, and those two pin the **lowest** available version. Every role
pins a version explicitly - never a bare family alias.

---


## Downloadable logs: every feature with a run has one

Added 2026-08-31 at the repo owner's instruction: **all features should have a
downloadable log.** This section is what that means in practice, so it is a
buildable obligation rather than a slogan.

### Why this is a rule

Read the Limits of almost any recent `docs/REGRESSION.md` entry. They say, over
and over, that things were never observed. Entry 367 is the clearest case: its
stall notice "has never been observed firing", extraction accuracy "was never
measured against a real board", no frame ever reached the model under test, and
no browser was ever opened. That is honest, and it is also a standing bet that
nothing will go wrong in a way nobody can see.

A downloadable log is the cheapest way to convert "never observed" into
"observable when it matters". It is the only instrument this repo has that runs
against real data, on real hardware, in the browser the feature actually ships
to - which is exactly where the node-env test suite cannot reach.

### What counts as a "run"

Anything with a start and an end that does work in between: a capture session, a
grading pass, a bulk action over N items, a workflow run, an import, a
long-running generation.

**Not** every feature. A pure library, a settings toggle, a layout change or a
one-shot form submit has no run and needs no log. Say so explicitly in the AC
rather than inventing a log to satisfy the rule - a log nobody will open is
noise that has to be maintained.

### The bar it has to clear

**A log that is silently missing an event still downloads, still opens, still
looks complete, and answers the user's question with the wrong answer - and it
will be believed, because it is the only evidence they have.** That failure is
worse than no log. So:

1. **Write down the diagnostic questions the log must answer** in the AC, in the
   user's words - "why did my table only have 6 posts", "why did this student
   get no grade" - and derive the events from those questions. Do not start from
   what is convenient to log.
2. **Log what the code THROWS AWAY, not just what it keeps.** This is where the
   answers live. A branch with seven exit paths that counts one of them cannot
   explain the other six. Suppressed items, skipped items, retried items, and
   *which* of several code paths ran are the diagnostic payload; totals alone
   are decoration.
3. **Failures carry their real reason**, the same way the surfaced error does. A
   log recording "extraction failed" when the action returned a 429 with a
   Retry-After is a log that will be read once and never again.
4. **Completeness is tested per call site**, and the test is sabotage-checked -
   delete a log call, confirm a test goes red. A source-text scan over a
   directory is not sufficient; this repo has had two separate scanners report
   clean without checking anything.

### The vetted mechanics

- **Download:** `triggerFileDownload(blob, filename)` at
  `src/app/components/course-planning/utils.ts:19-28`. Do not hand-roll an
  anchor - `repoGrades.wiring.test.ts:696-703,733-734` asserts call sites use the
  shared helper from inside an `onClick`, and the older sites that hand-roll it
  are near-misses, not precedent.
- **Shape:** plain `.txt` for a session-shaped run - a header block plus
  sections. `src/lib/live-class/session-log.ts` is the template: one session,
  `nowMs` taken as a parameter so a mid-run download honestly reads "still
  running". CSV suits a per-item table and nothing else; forcing four different
  shapes into rows is a documented mistake (`repo-grading-log.ts:245-251`).
- **Storage:** default to in-memory plus a Blob built at click time. Do not add a
  `ta-`-prefixed key for log data - the origin quota is already shared with
  40-plus keys, and the one that eventually throws will belong to some other
  feature. Persisting a log for cross-run comparison is a deliberate, separate
  decision.
- **There is no shared logger, and that is currently correct.** Five hand-rolled
  ones exist (`repo-grading-log.ts`, `rubric-run-log.ts`,
  `workflow-run-log-text.ts`, `repo-grades/repoGradesLog.ts`,
  `live-class/session-log.ts`), and two argue explicitly for not sharing.
  Consolidating them is its own group with a frozen literal oracle - never a
  side quest inside a feature.

### PII

A log carries whatever the feature touches - student names, submitted text, post
bodies. Default to a **diagnostics-only** payload of counts, timings, reasons and
identifiers rather than content; that sidesteps redaction instead of doing it
badly. `src/lib/workflows/run-input-redaction.ts` is a credential and binary
scrubber with no concept of a person's name and is **not** reusable here. If a
log must carry content to be useful, say so in the AC, make it an explicit opt-in
at download time, and state it in the REGRESSION Limits.

---
## Worked example: 2026-08-21

Two chunks shipped through this loop in one session, before steps 4 and 10
existed - the split each one used was decided in the same context that wrote
the AC, and neither group's diff was read end to end by a fresh reviewer.

**Chunk 1 - Settings to Diagnostics** (commit `ce45554`). Three agents on
disjoint sets: lib, server action, UI page. The audit (step 8) found the action
collapsing every per-URL failure into a bare `null`, which made an SSRF refusal
render identically to a 404 on a screen whose entire purpose was explaining why
an import was stuck. Fixed, and given its own test file - the lib tests
structurally could not catch it, because the lib threw correctly in both cases
and the information was lost one layer up.

**Chunk 2 - cartridge import and upload** (commit `1808cb2`). Four agents:
lib, action, a pure extraction, and the UI. Step 3's research changed the design
materially - Canvas's file upload turned out to be three steps, and the omitted
third step is what manufactures the permanently stuck migrations chunk 1 had
just built a screen to diagnose. A count canary fired at step 9 and was bumped
in the same commit. Step 8's reachability trace confirmed by hand that the new
buttons render and the modal mounts.

Both chunks: every sabotage produced the expected failure, and both entries'
Limits record that **no code path was ever run against a real Canvas course.**
