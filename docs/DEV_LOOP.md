# The dev loop

How work gets built in this repo. This is the process actually in use, not an
aspiration - every rule below exists because skipping it cost something once.

The loop has twelve steps and **ends at the push**. There is no post-deploy visual
check (suspended 2026-07-26).

---

## The core principle

**Author is never checker, for every artifact - not just code.**

An agent that produced a thing is the worst available judge of whether it is
right. That applies to an acceptance-criteria document, an architecture, a
survey, a test and a fix, exactly as it applies to a feature. So every artifact
is adversarially checked by a **fresh peer of the same class** before its
consumer sees it, and the chain ends only on a clean check.

**Every peer-level agent is an expert ed-tech contributor.** Not a generic
software agent that happens to be working on a school app. The architect, the UX
pass, the data engineer, the aesthetics pass, the reviewer, the regression pass,
the researcher and every adversarial checker are all people who have built and
run educational technology: they know LMS behaviour (Canvas quirks, gradebook and submission
semantics, roster and enrolment shape), instructional design and rubric
practice, academic-integrity pressure, FERPA-shaped handling of student data,
accessibility as a legal obligation rather than a nice-to-have, and what an
instructor's week actually looks like at 11pm the night before grades are due.

Say it in the brief, because it changes what they find. A generic reviewer
checks that a grade is computed correctly; an ed-tech reviewer asks whether the
grade is defensible to the student it is shown to, whether a score can be
uploaded to the LMS, whether a comment written in the instructor's voice would
survive being read aloud in an appeal, and whether the feature quietly makes an
instructor's workload worse. Every defect in this repo that mattered - grading
the instructions as the submission, a no-submission student scoring 10.80/12,
a reply addressed to the wrong student - was a domain failure wearing a
software failure's clothes.

Two consequences that are easy to skip and expensive to skip:

- **The orchestrator does not perform the highest-tier steps itself.** It
  chunks, briefs, dispatches, adjudicates, reports and pushes. Doing the
  architecture or the review in the same context that wrote the AC destroys the
  only property that makes those steps worth running - a reader who has nothing
  but the documents, which is exactly what the implementers will have.
- **A sabotage check is itself an artifact and can fail silently.** See the
  traps section: a sabotage that does not actually apply reports green and looks
  identical to a test that cannot fail.

---

## 0. Before anything else

**0a. Compare the request against what is already done, queued, or in flight.**
`git log`, `docs/REGRESSION.md`, open task chips, running agents. A surprising
share of requests are already built, already surveyed, or already contradicted
by something in the tree - and the most valuable thing an orchestrator does is
notice that before dispatching anyone. If a request turns out to already exist,
say so and reframe the work as fixing why it looks absent, in the same turn.

**0b. Re-chunk the WHOLE queue when a request lands mid-session.** Do not append
it. Re-plan, in this priority order:

1. **File-set disjointness** - proven against real file sets, not guessed from
   names. Two chunks that both edit one file are one chunk.
2. **Unblockers first** - anything other chunks are coded against.
3. **Same-evidence items together** - work that needs the same survey or the
   same measurement should not pay for it twice.
4. **Each chunk independently pushable** - a chunk that cannot ship alone is
   mis-drawn.
5. **Never chunk around the gates.** If a split exists only to avoid a canary,
   a ceiling or a regression pass, it is the wrong split.

**0c. Dispatch disjoint work as concurrent subagents.** Standing consent, no
size threshold. Prove disjointness against the real file list before dispatch,
and gate the returning wave with `git status --short`.

**0d. A new ask never preempts the in-flight chunk's push.** Research and
specification for the new thing can start immediately and in parallel; its
CODE waits until the current chunk is pushed. Interleaving two groups' code in
one working tree is how a regression pass stops meaning anything.

## 0e. Standing consent

These do not need to be asked about, ever:

- **Dispatching disjoint file sets as concurrent subagents.**
- **Committing and pushing to `main`** once the loop completes.
- **Starting the next backlog item** immediately after a push. A push is not a
  checkpoint. Say what you picked; do not ask permission to pick it.

While a backlog exists, forward motion beats confirmation, and **the chunking is
the authorization**.

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

**Verify each candidate by READING it AND its call sites** - never by its name,
its neighbours, or a memory of it. Two failures this has already caused here:
an AC named a type that does not exist anywhere in `src/`, sending implementers
to a file whose same-named export meant something else entirely; and an AC cited
a function's line number from a *different* file. Both compile. Both would have
shipped.

The call sites are the half people skip, and they are where the answer usually
is: a helper's signature does not tell you that its second parameter is always
`undefined` in production, or that the one existing caller passes a shape your
feature cannot produce.

## 3. Plan, research, revise until stable

Where the work touches an external API or an unfamiliar standard, verify the
details **before** hand-off. Guessing a parameter name and letting four agents
build on it wastes the whole wave.

Fold what you learn back into the AC, then re-read it. Iterate until it stops
changing.

## 4. Four concurrent pre-code passes: architect, UX, data engineer, aesthetics

**Spawn all four in one message, on the highest model available, before any
code.** They are independent, they read the same documents, and they find
different classes of problem - running them in sequence wastes a round trip and
lets the first one's framing contaminate the others.

- **4a. The architect** - module and data-flow design, the disjoint file split,
  the order of work, and the trade-offs it rejects.
- **4b. The UX pass** - the flow and its click cost, the empty states, the
  keyboard path, focus, the copy. Reuses this app's existing visual vocabulary
  rather than inventing a second one. **This is where "minimize clicks" is
  designed** (see the standing rules).
- **4c. The data-engineer pass** - what the data actually is: payload sizes with
  real numbers, token and latency cost, dedupe and identity, persistence limits,
  and the exact text of any prompt. **Measured, not estimated**, wherever
  measuring is possible.

- **4d. The aesthetics pass** - writes the REQUIREMENTS the surface must meet to
  read as a modern, professional product, before anything is built. Not "make
  it pretty afterwards": a named type scale, radius set, spacing rhythm and
  elevation set; which existing idiom each new element reuses; the empty,
  loading and error states; and the specific way this surface will otherwise
  drift from the rest of the app. It writes against `docs/aesthetics-pass-
  acceptance-criteria.md` section 4b (AM1-AM26), which is the standing design
  contract - **it does not restate that contract, it says what this feature
  adds to it and where this feature is likely to breach it.**

  It names the reference products it is holding the work to, and it must be
  specific about what those products do that this one does not. Its output is
  as binding as the architect's: a requirement it writes is a line an
  implementer is held to at 8b, not advice.

Reconcile all four into the AC before planning goes further. Where two of them
disagree, that disagreement is the finding.

What these have caught in this repo that nothing else did: a frame width that
made body text unreadable on a 4K monitor (measured, not guessed); a dedupe key
that false-split on 10 of 16 realistic inputs; a hook that would have breached
the line ceiling by 200 lines; and a UI control that shipped working, correct
and invisible.

**4d exists because of what happened when it did not.** The 2026-09-01
aesthetics pass (REGRESSION 381) ran its requirements as an ad-hoc chunk rather
than as a standing role, and its spec had to be corrected FIVE times mid-wave,
with seventeen agents already building against it: a rule that banned raw hex
while no token existed for a filled button's foreground; an amendment that
deleted a focus indicator, because the ring was a `box-shadow` on a rule that
also set `outline: none`; a global spinner that could not spin, because
Lightning CSS scopes animation-name references inside a module; ties that
rounded a 2px gap through zero and deleted it; and a cited class that lived in
a different file. Every one of those is a requirement that should have been
written and adversarially checked BEFORE dispatch. That is 4d's job.

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

- **No git writes at all.** Not `stash`, not `commit`, not `checkout`, not
  `restore`. One agent's stash reverts every sibling's work, and a commit
  mid-wave destroys the `git status --short` gate that step 7 depends on. The
  orchestrator owns the tree.
- **"0 errors AND 0 warnings"**, stated explicitly. An agent told only "no
  errors" will report success over a wall of warnings, including ones it
  introduced.
- **Return the file list it actually touched**, so step 7 has something to
  compare against besides the diff.
- Concurrent dependencies are coded against the **AC contract**, not against
  files that may not exist on disk yet. If `tsc` reports a sibling's module
  missing, report it - do not create it or inline a copy.
- **Say what it had to guess.** Every guess is a line the AC failed to write,
  and the guesses are where the next defect lives. Agents that were asked this
  in this repo have surfaced a missing interface field, a contradiction between
  two ACs, and a stale spec sentence - none of which any gate would have caught.
- **Frame the work as a rival vendor would see it.** An agent asked to check its
  own work grades generously; an agent asked whether a competitor could
  embarrass us with this diff finds the thing that ships broken.
- **State that the agent is an expert ed-tech contributor** (see the core
  principle). Peer-level briefs say it outright and name the domain lens the
  step needs - LMS and gradebook semantics for anything touching grades or
  submissions, instructional design and rubric practice for anything touching
  feedback, accessibility-as-obligation for anything rendered, student-data
  handling for anything logged or exported. Implementer briefs carry it too:
  the question "would an instructor defend this to a student" catches things
  "does this compile" never will.

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

**The line ceiling is audited, not assumed, and exceeding it is a VERIFICATION
FAILURE - not a cleanup task.** Count every touched file with
`@(Get-Content path).Count` and report the numbers. A file over 1000 lines does
not get a follow-up ticket; the wave is not verified until it is split. Size an
extraction against the feature's ADDITIONS, not against the headroom - the
headroom is what a later group will need.

## 8b. Follow-up architect, UX, data and aesthetics passes against the REAL diff

The step 4 quartet designed against documents. Run all four again, concurrently,
against what actually landed. This is not a repeat: a design is a prediction,
and the diff is the outcome. The follow-up pass is where you learn that the
split held but the props are unstable, that the flow is right but a control is
unreachable, or that the measured payload is nothing like the estimate.

**The aesthetics pass here is a CONFORMANCE check against the requirements it
wrote at 4d**, and it is the same agent class, never the same context - an
author is the worst available judge of whether its own requirement was met. It
answers three questions and cites file:line for each:

1. **Which of its own 4d requirements did the diff actually meet?** A
   requirement not met is a finding, whether or not the result looks fine.
2. **Where did the implementers diverge, and was the divergence RIGHT?** This
   matters as much as the failures. Five agents in the 2026-09-01 pass refused
   an instruction and were right every time - a row height numerically coupled
   to JS scroll math, a wide matrix header kept in sentence case for word-shape
   scanning, a brand mark exempted from the icon scale, a `--success` "text"
   that was a `currentColor` dot, a described padding that did not exist. A
   conformance pass that marks those as violations is worse than no pass.
3. **What does the diff now look like NEXT TO its neighbours?** Seams between
   agents are invisible from inside one file set: the same idiom at two sizes in
   two surfaces reachable in four clicks, a spinner on one tab and a grey word
   on the next, icons at 13px beside icons at 20px.

It must also state plainly what it could NOT check. Nothing in this repo renders
a component, so every aesthetic claim is a claim about source text. Contrast is
arithmetic over hex values, not a measurement; clipping, reflow at 400% zoom,
and real hit-target sizes cannot be seen at all. Say so rather than implying
coverage that does not exist.

Their findings go into step 10's merged list.

## 9b. Accessibility gets its own pass

Not folded into the general review, because it is the thing a general reviewer
skips when the diff is large and the deadline is close - and because **no test
in this repo can check any of it**. vitest here is node-env and renders no
component, so every a11y property is verified by reading, once, by an agent
whose only job is that.

Work it as a checklist with file:line citations, not as a vibe: accessible names
on every control, `aria-sort` only on sortable headers, roles that can actually
carry a label (a bare `<div>` cannot), keyboard reachability of anything
scrollable, `aria-disabled` rather than `disabled` where focus must survive,
focus restoration after a removal, live regions that are not flooded by a
ticking timer, and error text that is not `role="alert"` when N of them fire at
once.

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

## 10. Review, research, aesthetics and repair - four agents, highest model

Before the regression pass the group's work goes through four **separate**
subagents, every one of them on the **highest model available** and pinned
explicitly. Separate contexts, not one agent wearing four hats: an agent that
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

**10bb. The aesthetics reviewer** runs **concurrently with 10a and 10b**, on the
whole group's diff, holding the requirements it wrote at 4d. This is the
conformance half of that role and it is the same check 8b runs, at the group's
scale rather than a wave's: what was required and not delivered, what diverged
and was right to, and what the surface looks like beside its neighbours.

Its distinct value at this scale is the **seam**, which no single-surface pass
can see. The 2026-09-01 group shipped the same tracked-uppercase label at 11px
and 12px in four surfaces four clicks apart, three icon construction styles in
one seven-item column, and a loading state that was a spinner on one tab and an
unstyled grey word on the next - every one of them invisible from inside the
file set that produced it.

It reports findings. It does not edit.

**10c. The fixer** receives all three reports, merged and de-duplicated, and is
the only one of the four that touches the working tree. It gets the same brief
discipline as step 6: an explicit file list, and no `git stash`.

It has no authority to dismiss a finding. If a finding looks wrong, it says so
in its report and leaves the code as it was - a fixer that silently declines
turns a finding into a silence, and silence is indistinguishable from fixed.

Its changes are code like any other: they re-run the gates and each one needs a
test that can fail. Then the reviewer re-reads the fix diff and confirms each
finding is actually closed. A fix that touched anything outside the reported
findings goes round 10a, 10b and 10bb again in full.

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

**Model roles:** every step 4 pass - architect, UX, data engineer, aesthetics -
and all four step 10 agents - reviewer, researcher, aesthetics, fixer - take the
**highest** model available. Sonnet implements and Opus verifies, and those two
pin the **lowest** available version. Every role pins a version explicitly -
never a bare family alias.

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

### It must be enough to actually debug from, by a human OR an LLM

Added 2026-08-31 with the rule itself. Two requirements, both testable.

**1. Self-contained enough to debug without the code in front of you.** The
realistic use is the owner hitting a problem, downloading the log, and pasting
it into a chat with an assistant that has never seen this repo. That reader has
no access to the source, the settings, or the machine. So the log carries:

- a **header block**: the feature, when the run started and ended (or that it is
  still running), and the app version or commit if reachable;
- **every setting in force for that run**, by name and value - audience,
  provider, batch sizes, thresholds, whatever the run actually branched on. A
  log that omits the settings cannot explain a behaviour that the settings
  caused, which is most of them;
- **the environment facts the behaviour depends on** - viewport or capture
  resolution, browser, whether the tab was hidden - where the feature's own
  correctness depends on them;
- a **timestamp on every event**, relative to the run's start, so ordering and
  duration are both recoverable;
- **stable event names**. The same condition gets the same wording every time.
  A reader pattern-matching across two runs cannot do it if the same event is
  phrased three ways.

The test: hand the log to someone who has never seen the code and ask them to
answer the diagnostic questions the AC listed. If they need to open a source
file, the log is incomplete.

**2. Never truncate a reason.** Whatever detail the surfaced error carried, the
log carries in full - status codes, provider messages, the failing identifier.
Truncation is what turns a log into a second, less useful copy of the UI.

Keep it pasteable. A run log that is megabytes cannot be handed to an assistant
or read by a person; if a run can produce that much, the log summarises the
repetitive middle and keeps every distinct failure verbatim, and says in the
file that it did so.

### It has to be findable

**The download control lives on the feature's own view, visibly, near where the
run happens** - not in a settings pane, not behind an overflow menu, not on
another tab. A log nobody can find has the same value as a log nobody wrote,
and this repo has already shipped four capabilities that existed and could not
be reached.

It states what it holds - a row count, an event count, the run's duration -
rather than being a bare unlabelled icon, so it is obvious there is something in
there worth downloading. If the feature has runs and the log is empty, say that
too.

Same visibility discipline as any other control: a real label, not an icon
alone. The Discussion replies panel's copy button is the cautionary case - it
shipped working, correct and effectively invisible, because it was a 13px glyph
in a crowded cluster next to a red destructive button.

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

---

## Tests that cannot fail: the catalogue

Every entry here has actually happened, in this repo or a sibling one. A test in
any of these shapes is an assumption wearing a test's clothes, and the suite
being green is what makes it dangerous.

**The sabotage that did not apply.** You break the behaviour, run the suite, and
it reports green - so you conclude the test is weak, or worse, you conclude the
sabotage proved something. In fact the edit never landed: a replacement string
that did not match the file's line endings, a path that did not exist, an edit
to a copy. **Confirm the sabotage is present in the file before trusting its
result.** This happened here on 2026-08-31 and reported 16 passing tests over
code that had not been touched.

**The tested twin nobody calls.** Two agents implement the same rule against one
contract; production wires up one; the tests import the other. Invert the live
one and the suite stays green. This repo has now had FOUR instances in a single
feature - persistence, reordering, a freshness guard and a concept derivation.
When you consolidate, delete the loser rather than leaving it exported, and
check by grep which one production imports.

**The assertion of absence.** `expect(result.foo).toBeUndefined()` passes when
`foo` was renamed, when the object is empty, and when the function returned
early without doing anything. Assert what IS there.

**The fixture the code never emits.** A green suite proves nothing if every
fixture uses a shape the UI cannot produce. Note that `tsc` catches a subset of
this and vitest does not - on 2026-08-31 the type gate rejected a fixture
missing a required field that every test had accepted.

**The injected fake that cannot see the bug.** A mock whose signature ignores
the argument under test will pass whether or not the caller passes it. If the
defect is "a field was dropped", the fake must be able to observe the field.

**Mocks that outlive their reset.** `vi.restoreAllMocks()` does not clear a
factory mock. A stale mock from a previous test makes the next one pass for the
wrong reason.

**The round-trip that hides the regression.** Testing `serialize` by
`deserialize(serialize(x))` passes when both sides share a defect, and when the
deserializer independently re-defends the invariant the serializer just broke.
Assert against the serialized output directly. This exact case was caught here
by a sabotage check that the first draft of the test survived.

**The test that pins the spelling.** Asserting exact prompt text or an error
string's wording forces contorted implementations and goes red on every
harmless edit. Pin the FACT and the ORDERING.

**The count canary nobody bumped.** When a total and a sub-count both move by
one, that agreement is the proof the new member landed in the right bucket -
which is why the bump belongs in the same commit, and why "fixing" a red canary
by deleting an entry destroys the only thing it was measuring.

**The scanner that matched nothing.** A source-text scan that reports clean
because its pattern never matched anything at all. Two have done this here.
Every scanner needs a canary case proving it fires on known-bad input.

---

## Standing rules

**Minimize clicks.** Click cost is a first-class design factor, not polish. It
is **designed at 4b**, **checked at step 8's audit**, and **re-judged at 8b**
against the real diff. It never trades against accessibility, and it never
removes a confirmation on a destructive action - a two-step delete is not a
click to be saved.

**Every new textbox, select or checkbox persists** across reloads under a
`ta-`-prefixed localStorage key, added to the canary's expected set in the same
commit.

**Context goes in BEFORE the capture, everywhere.** Added 2026-08-31 at the repo
owner's instruction: *any* surface where the instructor records something in
order to generate something offers a place to enter context **before anything is
generated**.

The reason is structural, not a preference. On these surfaces the model's only
other input is what the capture happened to contain - a screen, a voice, a set
of frames. The instructor knows things the recording cannot show: who it is for,
what to emphasise, what to leave alone, what the last one got wrong. Without a
place to say so, that knowledge either never arrives or arrives as a re-run,
which costs a second generation and throws away the first.

Requirements, so this is buildable rather than aspirational:

- The control is reachable **before the record button**, not revealed after the
  capture stops. A context box that appears next to the output is a re-run
  affordance, not a context affordance.
- It is **optional**. It never gates starting a capture, and an empty value
  produces exactly today's behaviour.
- It **persists** under a `ta-`-prefixed key like any other control - the same
  standards usually apply to the next recording too.
- It **actually reaches the prompt**, and the AC says where. Threading a box to
  nothing is the reachability failure this loop catches most often.
- Where selected knowledge-base pages, a rubric or a course already supply
  context, they satisfy this rule for that surface - the requirement is that
  context is *possible before generation*, not that every surface grows a
  freeform box.
- **The obligation belongs to the DESTINATION, never to a launcher.** A surface
  can now be reached several ways - a tab, a bulk action carrying selected
  pages, a FAB entry carrying nothing. Putting the context control on one
  launcher satisfies that route and leaves every other route uncovered,
  including the plain one where the instructor simply navigates there. So the
  destination always offers it, and a launcher that happens to carry context
  pre-fills it. This also keeps the rule checkable: count the destinations, not
  the entry points.

This applies to surfaces that already exist, not only new ones. Retrofitting
them is real work and belongs in the backlog rather than being assumed done.

**Reachability is a first-class check.** A capability can pass every gate and
ship dead. Trace each one from the control the user touches to the code that
performs it. This repo has shipped, with every gate green: a counter computed
and never exposed, an error reason with no path to the screen, a warning made
unreachable by a second implementation of the same ceiling, a guard whose tested
copy was not the live one, and a control that rendered but was invisible.
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
