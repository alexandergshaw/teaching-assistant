# G3 scope: the orphan sweep's 250ms per-call latency assumption

Row: `docs/backlog.yml`, `- id: 'G3'` (`grep -n "id: 'G3'" docs/backlog.yml`
returns line 106). Read in full this pass (lines 106-116):

```
- id: 'G3'
  state: 'unscoped'
  kind: 'chore'
  area: 'orphan-upload-sweep'
  title: 'The sweep''s per-call latency assumption (~250ms, cited at
    src/lib/orphan-upload-sweep.ts:46,55) underpins both
    MAX_USER_PREFIXES_PER_TICK and PHASE1_ROOT_LISTING_BUDGET_MS. A wrong
    assumption makes the sweep UNDER-clean, which is the safe direction.'
  owns: []
  verify: null
  blocked_by: []
  instrument: ''
  from: 'c25bdec'
  note: 'First tick''s timing (pre-migration Note column)'
```

This is the first `g3-scope.md` in `docs/` (`ls docs | grep -i "^g3-"`
returns nothing, exit 1; `git log --oneline --all -- docs/g3-scope.md` returns
nothing) - there is no prior version, so the disposition-table requirement
for a restructuring does not apply. Everything below is a fresh finding
against the tree, measured 2026-09-23.

**Unverifiable in this environment, stated up front:** no live Supabase
project exists in this checkout (no `.env`, per `docs/loop/this-repo.md`
section 6), so the real per-call latency of a Supabase Storage `.list()` or
`.remove()` call against the `course-files` bucket cannot be observed here
under any circumstance. Every latency figure below is either a quantity read
out of a code comment (labelled as such) or an arithmetic derivation from
that comment (labelled as arithmetic, never as a measurement).

---

## 1. Where the 250ms figure came from

**Assumed, not measured, and not inherited from an earlier value.** Two
independent checks:

- The code says so itself. `src/lib/orphan-upload-sweep.ts:44-45`: "assumed
  (not measured - no live Storage in this checkout) per-user-prefix cost of
  two `.list()` calls at up to 250ms each." `:55`: "Assumed ~250ms per root
  `.list()` call." Both comments use the word "assumed" and both name the
  same reason (no live Storage locally) - this is not an oversight the
  comment is silent about, it is a documented assumption.
- `git log --oneline -S "250ms" -- src/lib/orphan-upload-sweep.ts` and the
  same for `-S "MAX_USER_PREFIXES_PER_TICK"` and
  `-S "PHASE1_ROOT_LISTING_BUDGET_MS"` each return exactly one commit,
  `c25bdec` ("feat(storage): sweep orphaned rubric and syllabus uploads") -
  the same commit that created the whole file
  (`git log --diff-filter=A --oneline -- src/lib/orphan-upload-sweep.ts`
  also returns only `c25bdec`). So there is no earlier commit this number
  could have been inherited from; 250ms was invented whole in the commit
  that introduced it, alongside the comment admitting it is unmeasured.

**What I could not check:** whether 250ms is a reasonable industry figure
for a Storage-API `.list()` call in general (e.g. against Supabase's own
published latency figures). This checkout has no network access under
vitest and I did not fetch external pages for this pass, so I am not
treating "is 250ms plausible" as answered either way - only "was it
measured here" (no) and "was it inherited" (no).

---

## 2. Every bound derived from it, and the absence check

**Two bounds, both exported constants in `src/lib/orphan-upload-sweep.ts`,
both consumed only by `src/app/api/cron/sweep-orphan-uploads/route.ts`:**

1. **`MAX_USER_PREFIXES_PER_TICK = 100`** (`:52`). Derivation in the comment
   at `:44-51`: assumed cost of two `.list()` calls per user prefix (one per
   path segment - see below) at up to 250ms each = ~500ms/prefix;
   `50_000 / 500 = 100`. The comment itself calls this "the BREAK-EVEN
   point, not a conservative margin" and states plainly that "real
   protection comes from the inner-loop deadline checks below, not from
   this ceiling" (`:49-50`). It protects nothing directly - it is a plain
   loop cap (`sweepOrphanUploads`'s `for` loop at `:337`,
   `i < options.maxUserPrefixesThisTick`) that exists as a second line of
   defense alongside the live `Date.now() > softDeadlineAtMs` checks at
   `:338` and `:354`.
2. **`PHASE1_ROOT_LISTING_BUDGET_MS = 20_000`** (`:60`). Derivation in the
   comment at `:54-59`: assumed ~250ms per root `.list()` call (100
   entries/page): `20_000 / 250 = 80` page calls, i.e. up to 8,000 user
   prefixes counted before phase 1 gives up. This one DOES gate directly:
   it is `phase1BudgetMs`, checked at `orphan-upload-sweep.ts:204`
   (`if (Date.now() > phase1DeadlineAt)`) inside `listAllRootPrefixes`
   (`:196-217`), and if phase 1 does not finish within it, the whole tick
   returns `totalUserPrefixes: null` (`:309-315`).

**The two-`.list()`-calls-per-prefix figure in bound 1 is itself grounded,
not invented:** `SWEPT_PATH_SEGMENTS` (`orphan-upload-sweep.ts:76`) is
`UPLOAD_PATH_SEGMENTS` imported from `src/lib/syllabus-upload-source.ts:66`,
which is `["syllabus-uploads", "rubric-uploads"] as const` - exactly two
segments, matching the comment's "two `.list()` calls" claim. Verified by
reading the array literal directly, not by trusting the comment's count.

**Bounds NOT derived from the 250ms figure, checked so they are not
wrongly folded in:**

- `SWEEP_SOFT_DEADLINE_MS = 50_000` (`:42`) is set by its own comment as
  "identical reasoning to `run-schedules/route.ts`'s `runDeadlineMs`" -
  padding under the platform's 60s `maxDuration` cap, independent of any
  per-call latency figure. It is the budget that bound 1's derivation
  divides INTO (`50_000 / 500`), but it is not itself derived FROM 250ms.
- `ORPHAN_SWEEP_THRESHOLD_MS = 10 * 60 * 1000` (`:34`) is an object-age
  threshold (how old an upload must be before it is a sweep candidate),
  unrelated to listing speed.

**Canary proving the absence check actually ran, not a silent zero:**

```
grep -rn "250ms\|250 \*\|\* 250" --include=*.ts --include=*.tsx --include=*.yml src .github
```
returns SIX hits across FOUR files, not zero - confirming the pattern is not
silently broken (a broken/over-narrow pattern that always returns nothing
would look identical to "no other bound exists" without this check). The
four files: `useVisualizerCoverage.ts`/`.test.ts` (an unrelated
double-click timing window, `:205`/`:258`), `src/lib/embedded-grader/rubric.ts:184`
(`maxPages * 250`, an unrelated per-page cost figure), and
`src/lib/submission-zip-intake.ts:27` (`250 * 1024 * 1024`, a byte-size
constant, not a latency figure) - three genuine matches on the digits "250"
that are NOT related to G3's assumption, plus the two real hits inside
`orphan-upload-sweep.ts:46,55`. So the search fires correctly, and the only
file where "250" means "assumed per-call latency of a Storage API call" is
the one this row already names.

Second canary, for the two derived-constant NAMES specifically:
```
grep -rln "MAX_USER_PREFIXES_PER_TICK\|PHASE1_ROOT_LISTING_BUDGET_MS" --include=*.ts --include=*.tsx --include=*.yml .
```
(excluding `node_modules`) returns exactly four files:
`.github/workflows/sweep-orphan-uploads.yml` (a comment at `:128` referring
to `PHASE1_ROOT_LISTING_BUDGET_MS` by name in an error message string, not a
YAML-level use of the value), `docs/backlog.yml` (this row's own prose),
`src/app/api/cron/sweep-orphan-uploads/route.ts` (the real consumer,
`:9-11` import, `:109-110` usage), and `src/lib/orphan-upload-sweep.ts`
(the definitions). **Neither test file for this module
(`src/lib/orphan-upload-sweep.test.ts`, `route.test.ts`) imports either
constant by name** - confirmed by re-running the same grep restricted to
those two files, which returns nothing. `orphan-upload-sweep.test.ts:93-94`
and `route.test.ts` instead hardcode literal `20_000` and `100` as test
option values (`baseOptions({ phase1BudgetMs: 20_000 })`,
`maxUserPrefixesThisTick: 100`, `orphan-upload-sweep.test.ts:93-94`), and
`route.test.ts` asserts only `SWEEP_SOFT_DEADLINE_MS` and
`ORPHAN_SWEEP_THRESHOLD_MS` against the options object passed to
`sweepOrphanUploads` (`route.test.ts:91,97`) - never
`PHASE1_ROOT_LISTING_BUDGET_MS` or `MAX_USER_PREFIXES_PER_TICK`. So: no
third bound exists anywhere in the tree, and neither of the two real bounds
has a test that would fail if its production VALUE were changed (only tests
of the generic mechanism, using literals, exist).

---

## 3. What happens if the real latency is 2x, 5x or 10x the assumption

Worked through arithmetically from the same formulas in section 2 -
labelled ARITHMETIC throughout, never a measurement, since there is nothing
to measure against here (section 4).

**Bound 2 (`PHASE1_ROOT_LISTING_BUDGET_MS`, phase 1) - breaches LOUDLY, via
an existing gate, IF the real number of root user-prefixes is large
enough:**

| Assumed multiple | Per-call ms | Pages in 20s | Prefixes phase 1 can count |
|---|---|---|---|
| 1x (current) | 250 | 80 | ~8,000 |
| 2x | 500 | 40 | ~4,000 |
| 5x | 1,250 | 16 | ~1,600 |
| 10x | 2,500 | 8 | ~800 |

(`20_000 / per-call-ms`, pages times 100 entries/page - the same formula
`orphan-upload-sweep.ts:56` uses at 1x, re-run here at each multiple.) If
the real root-prefix count in production Storage exceeds the row's
capacity, `listAllRootPrefixes` (`:196-217`) hits its `Date.now() >
phase1DeadlineAt` check (`:204`) before finishing, `phase1.names` is `null`
(`:205`), and `sweepOrphanUploads` returns `totalUserPrefixes: null`
(`:309-315`) for the WHOLE tick - phase 2 never runs at all that tick, per
`sweepOrphanUploads`'s own doc comment at `:253-256`.

That response field reaches `.github/workflows/sweep-orphan-uploads.yml`,
whose `RULING B` block (`:127-129`) is:
```
if [ "$totalUserPrefixes" = "null" ]; then
  echo "::error::Sweep's root listing pass did not complete within budget
  this tick ... the deployment likely has more user prefixes than
  PHASE1_ROOT_LISTING_BUDGET_MS was sized for ..."
  exit 1
fi
```
This is a LOUD, already-existing, already-gating failure (`exit 1`), and
its own error message names `PHASE1_ROOT_LISTING_BUDGET_MS` directly. **What
the owner sees:** a red GitHub Actions run, four times an hour
(`sweep-orphan-uploads.yml:22`, cron `"9,24,39,54 * * * *"`), and per
`docs/n3-scope.md` section 1's residual 2 (unverified from this checkout),
possibly GitHub's default failed-run email. **What I could not establish:**
the real number of root-level user prefixes in production, so I cannot say
whether this threshold would ever actually be crossed at any of these
multiples - that number does not exist in this checkout.

**Bound 1 (`MAX_USER_PREFIXES_PER_TICK`, phase 2) - a wrong assumption makes
it LESS binding, not more, and its effect is SILENT to the one alert this
deployment has:**

The comment already says the real safety mechanism is the live
`Date.now() > softDeadlineAtMs` check (`:338`, `:354`), not the `i < 100`
loop cap. If the real per-prefix cost is higher than assumed, that live
check fires EARLIER in wall-clock terms, at fewer than 100 prefixes - the
100 cap becomes moot rather than dangerous (it was never load-bearing per
the comment's own admission). Arithmetically, effective prefixes-per-tick
before the soft deadline trips scales as `50_000 / (2 * per-call-ms)`: ~100
at 1x, ~50 at 2x, ~20 at 5x, ~10 at 10x.

The resulting state is `truncatedByBudget: true` and a lower
`scannedUserPrefixes` (`orphan-upload-sweep.ts:426,436`), both surfaced in
the JSON response body at `route.ts:130,135`. **Neither field is read by
the alerting workflow.** Checked directly:
`grep -n "truncatedByBudget\|scannedUserPrefixes" .github/workflows/sweep-orphan-uploads.yml`
returns only two hits, both inside COMMENT text at `:139,141` (referencing a
past bug, "MJ-2"), never inside a `jq` extraction or an `if` condition. The
workflow's `jq` step (`:75-77`) extracts exactly three fields -
`failedCount`, `totalUserPrefixes`, `listingErrors` - and nothing else from
the response body. The raw body is dumped to the log as text
(`cat /tmp/resp.json` in the same step), but nothing parses or annotates it
for `truncatedByBudget`. So: as long as `failedCount` stays `"0"` and
`totalUserPrefixes` is not literally `null`, the workflow run stays GREEN
even while silently scanning a fraction of the prefixes it would scan under
the 250ms assumption - **this is exactly the "sweep silently processes half
of what it claims" failure shape the brief asked me to distinguish from the
loud one, and it is real and currently unmonitored, independent of G3
being scoped or not.**

**Net answer to "which bound is breached first":** it depends on the real
root-prefix count, which is unmeasured (section 4). If that count is small
(a young or lightly-used deployment), NEITHER bound bites at any of these
multiples - both checks are time-based against real elapsed time, so a
slower-than-assumed call rate that still finishes phase 1 and does not
exhaust phase 2's real budget produces no observable difference at all,
just a longer-but-still-within-budget tick. If the real count is large
enough to matter, bound 2 (phase 1) is the one with a LOUD, already-wired
failure path; bound 1 (phase 2) degrades SILENTLY first in the sense that
under-scanning starts happening below the point where phase 1 would ever
notice - a tick can silently scan only 10-50 prefixes (at 5x-10x) for a long
time before the root-prefix count itself grows large enough to also blow
the phase-1 budget and turn loud. **Consistent with the row's own
"UNDER-clean is the safe direction" claim in the narrow sense the row
states it** - re-checked directly against the code: a candidate's
individual removal is still reconciled against `removedNames` regardless of
timing (`:400-421`), so a wrong latency assumption cannot cause a WRONG
deletion, only fewer or zero deletions this tick. It does not mean the
consequence is nothing: silent persistent under-scanning lets orphaned
objects accumulate past their 10-minute threshold indefinitely, unflagged,
which is the opposite of what this backstop exists for
(`orphan-upload-sweep.ts:1-11`'s own stated purpose).

---

## 4. Can this be measured here, and what would an owner-side measurement need

**Cannot be measured in this environment**, for two independent reasons,
not one:

1. **No live Storage.** No `.env` file, no live Supabase project
   (`docs/loop/this-repo.md` section 6). `vitest.setup.ts` throws on any
   real `fetch` (same doc, section 2). There is no path in this checkout
   that reaches a real `.list()` or `.remove()` call.
2. **No timing instrument exists to read, even in production, today.**
   Checked directly: `grep -n "performance\.now\|console\.time\|latency\|duration" src/lib/orphan-upload-sweep.ts src/app/api/cron/sweep-orphan-uploads/route.ts`
   returns only the doc-comment prose already quoted in sections 1-2 (the
   words "latency" and "duration" appear only in comments), and the ONLY
   `console.log` call in `route.ts` (`:92-95`) logs `tickAt` and
   `softDeadlineAt`, not any per-call duration. This is a materially
   different situation from `V3` (`docs/backlog.yml:29-39`): V3's question
   (which `remove()` response shape the live SDK uses) already has a
   purpose-built instrument shipped in the response body -
   `matchedByLeafName` / `matchedByFullPath` (`orphan-upload-sweep.ts:161-173`,
   surfaced at `route.ts:146-147`) - so V3 can be settled by reading ONE
   production tick's existing JSON body. **G3 has no equivalent counter.**
   Reading a production tick's response body today would show
   `scannedUserPrefixes` and `truncatedByBudget`, which bound the
   CONSEQUENCE of a wrong latency assumption, but nothing in the body times
   an individual `.list()` or `.remove()` call, so no tick's response body
   - however many are read - can currently confirm or refute "250ms" itself.

**What CAN be established from this checkout, and was, above:**

- The arithmetic derivations in sections 2-3 (re-run at 1x/2x/5x/10x),
  verified by reading the source formulas directly rather than trusting the
  row's summary of them.
- The bounds' relationship to each other and to the workflow's gating logic
  - which one fails loud, which one fails silent - established by reading
  `orphan-upload-sweep.ts`, `route.ts`, and
  `sweep-orphan-uploads.yml` directly, with line citations.
- That no timing instrument exists at all today, in either code path -
  established by a grep whose absence-of-match is corroborated by a
  positive match on the one `console.log` line that DOES exist (the search
  is not silently failing to find things; it correctly finds the one log
  call there is, and confirms it is not a timing log).

**What must be owner-measured against production, and the exact steps,
since there is no `gh` CLI here (`docs/loop/this-repo.md` section 5):**

1. **Ship an instrument first - there is nothing to read yet.** Add timing
   around the `lister.listPage` and `remover.remove` calls (for example,
   record `Date.now()` immediately before and after each call inside
   `listAllRootPrefixes`, `listPrefixSegmentToCompletion`, and the
   `remover.remove` call site at `:397`, and either log the deltas via
   `console.log`/`console.error` or fold aggregate min/max/mean into the
   JSON response body the way `matchedByLeafName` was added for V3's
   question). This is new code, not something this scope document can add
   itself (this pass's write set is this file only), and it is a real
   design decision (log vs. response-body counter, per-call vs.
   aggregated) - named here as a fork for whoever implements it, not
   resolved by this document.
2. **Deploy** (the existing push-to-main flow; migrations and app code both
   auto-deploy per this repo's own conventions).
3. **Read one or more ticks' logs**, since there is no `gh` CLI:
   - **Web UI path:** github.com/alexandergshaw/teaching-assistant (from
     `git remote -v`) -> Actions tab -> "Sweep orphaned syllabus/rubric
     uploads" workflow -> a recent run -> the "Call the orphan-upload sweep
     endpoint" step -> read the step's log text, which already includes
     `cat /tmp/resp.json` (`sweep-orphan-uploads.yml`, the step that dumps
     the raw body) plus whatever new timing output step 1 adds.
   - **`curl` path** (this-repo.md section 5's named alternative to `gh`):
     `curl -H "Authorization: Bearer <PAT>" https://api.github.com/repos/alexandergshaw/teaching-assistant/actions/workflows/sweep-orphan-uploads.yml/runs`
     to list runs, then
     `curl -H "Authorization: Bearer <PAT>" https://api.github.com/repos/alexandergshaw/teaching-assistant/actions/runs/<run_id>/jobs`
     for the job id, then
     `curl -H "Authorization: Bearer <PAT>" https://api.github.com/repos/alexandergshaw/teaching-assistant/actions/jobs/<job_id>/logs`
     for the raw log text. This needs a GitHub personal access token with
     `actions:read` - a credential this checkout does not have and cannot
     supply; it is an owner-only step for that reason alone, independent of
     the missing instrument.
4. **A softer, code-change-free alternative I could not verify from here:**
   Supabase projects typically expose request logs per-project in their own
   dashboard (Project -> Logs), which may show per-call latency for Storage
   API calls without any change to this repo's code. I have not confirmed
   this feature exists on the project's actual plan or that it would
   isolate `.list()`/`.remove()` calls specifically - this is a suggestion
   to check, not a verified capability, since I have no access to the
   Supabase dashboard from this checkout.

---

## 5. Should the assumption be replaced by a measurement, or is a better guess enough

**Neither, cleanly - the honest fix is closer to "make the constant matter
less" than either "measure it" or "guess better," and here is why, argued
from what section 2 already established rather than asserted fresh:**

The 250ms figure is NOT read by the running code at all - it exists only in
comments, as the design-time justification for choosing the two exported
INTEGER constants (`100` and `20_000`). At runtime, both bounds are already
governed by live `Date.now()` polling against real elapsed wall-clock time
(`:204,233,338,354`), not by a hardcoded page count. This means the 250ms
assumption is best described as a ONE-TIME SIZING INPUT, not a live
parameter - which is a materially different situation from N3's
`remove()`-shape question (section 6 below), where the unmeasured thing
IS read and branched on by running code every tick.

Given that:

- **"Measure it" (ship the instrument in section 4, then re-derive the two
  constants from real data) is the right fix for bound 2
  (`PHASE1_ROOT_LISTING_BUDGET_MS`)**, because that bound has a real, loud,
  already-wired failure mode (section 3) whose trigger point depends
  entirely on how close the true per-call latency and true root-prefix
  count are to the assumption. A better-informed constant directly lowers
  the chance of an avoidable loud failure. This is the case the row's own
  title emphasizes.
- **"Measure it" buys much less for bound 1
  (`MAX_USER_PREFIXES_PER_TICK`)**, because the comment's own admission
  that "real protection comes from the inner-loop deadline checks" means
  the code is already adaptive here in the sense that matters for safety -
  a wrong 250ms assumption cannot make phase 2 run long or delete wrongly,
  only stop earlier or later than the round number "100" would suggest.
  Re-measuring 250ms would produce a more accurate ESTIMATE of how many
  prefixes typically get scanned per tick, which is a real, useful
  operational number, but it would not close a safety gap the way it would
  for bound 2 - the gap for bound 1 is the silent-truncation VISIBILITY
  problem from section 3 (nothing reads `truncatedByBudget` or
  `scannedUserPrefixes`), not the constant's accuracy. **A wiring fix
  (surface `truncatedByBudget`/`scannedUserPrefixes` to the workflow, even
  as a warning) closes more real risk here than a better guess at 250ms
  would**, and it does not require knowing the real latency at all.
- **A better guess with no measurement is the weakest option for either
  bound** - it would replace one unmeasured, self-labelled assumption with
  another unmeasured, unlabelled one, which is worse for a future reader
  (nothing would flag it as still-open the way the current comments do).

**This is partly a product/cost call I am not making for the owner:** how
much of the 50-second tick budget to spend future-proofing phase 1 versus
phase 2, and whether shipping a new response-body counter or a new log line
is the preferred instrument shape, are choices the row's "chore" framing
does not settle. What this section settles is the SHAPE of the fix: measure
bound 2 for real, wire up (do not necessarily re-measure) bound 1's
existing-but-unread signals, and treat "250ms" itself as a sizing input to
retire once real data exists, not a value to keep guessing at more
precisely.

---

## 6. Relationship to N3's finding (same problem, or independent?)

**Same underlying root cause, independent axes, and G3 is structurally
worse off than N3's `remove()`-shape question in one specific way.**

Both are unmeasured assumptions about live-Supabase-Storage-SDK behavior,
introduced in the SAME commit (`c25bdec`), and the code labels both the
same way: `orphan-upload-sweep.ts:44-45` ("assumed (not measured - no live
Storage in this checkout)") and `:161-168`'s doc comment on
`matchedByLeafName`/`matchedByFullPath` ("the SDK's real `remove()`
response shape for a named delete is unmeasured in this checkout") use
near-identical phrasing for the same reason: this checkout structurally
cannot touch a live bucket, so anything about the live SDK's real behavior
had to be assumed at write time.

**They are independent, not the same defect wearing two names:**

- N3/V3's open question is about SHAPE/CORRECTNESS - does `remove()`
  return leaf names or full paths for a named delete - which determines
  whether `failedCount` means anything at all (`docs/n3-scope.md` section
  3, item 2).
- G3's open question is about SPEED - how long each `.list()`/`.remove()`
  call actually takes - which determines how MUCH of the bucket gets
  scanned per tick and whether phase 1 ever hits its own budget.

A tick can have a perfectly correct `remove()` reconciliation (V3 answered,
`failedCount` trustworthy) and still badly under-scan the bucket if the
real latency is far from 250ms; conversely a tick can scan exactly as many
prefixes as intended and still make every genuine deletion look like a
failure if the `remove()` shape assumption is wrong. Confirming one tells
you nothing about the other - resolving V3 does not touch G3's arithmetic
in section 2-3, and resolving G3 (however it is resolved) does not touch
N3/V3's shape question.

**Where G3 is worse off than V3:** V3 already has a purpose-built
instrument sitting in the response body today (`matchedByLeafName` /
`matchedByFullPath`), built specifically so ONE production tick's existing
JSON settles the shape question outright (`docs/n3-scope.md`'s own summary
of `V3`'s instrument: "the first production tick's raw body"). G3 has no
equivalent counter anywhere in the response body or logs (section 4) - so
where V3 is "read the next tick," G3 is "ship an instrument, then read a
later tick," which is a strictly larger and slower step. This asymmetry is
itself worth recording: the two rows look parallel in the backlog (both
"unmeasured live-SDK behavior from the same commit"), but they are not at
the same distance from being answered.

---

## 7. Residual register and recommendation

| # | What is not settled | Owner | Instrument | Object / direction of failure | Step that measures it |
|---|---|---|---|---|---|
| 1 | The real per-call latency of `.list()`/`.remove()` against the `course-files` bucket - whether it is close to, or a multiple of, the assumed 250ms | Whoever implements the timing instrument (unowned) | A NEW instrument (does not exist yet - section 4, item 1): per-call timing added around `listPage`/`remove` call sites, logged or surfaced in the response body, read from a production tick's Actions log via the GitHub web UI or `curl` (this-repo.md section 5) | Object: real elapsed ms per `.list()`/`.remove()` call. Failure direction: if the real figure is a large multiple of 250ms, `PHASE1_ROOT_LISTING_BUDGET_MS`'s effective capacity (section 3's table) is far below the ~8,000-prefix figure the constant was sized for, moving the LOUD `totalUserPrefixes: null` failure (yml:127-129) closer to whatever the true root-prefix count turns out to be | Ship the instrument (section 4, item 1), deploy, read one or more ticks (section 4, item 3) |
| 2 | The real total number of root-level user prefixes in production Storage - needed to know whether bound 2's capacity (section 3's table, any multiple) would ever actually be exceeded | Repo owner (needs the live Supabase project) | The `totalUserPrefixes` field already in every tick's response body (`route.ts:129`), read via the same web-UI or `curl` path as residual 1 - no new instrument needed for this one | Object: `totalUserPrefixes` across several real ticks. Failure direction: if this count is small relative to any of the capacities in section 3's table, the 250ms assumption's accuracy stops mattering in practice regardless of how wrong it is | A manual `workflow_dispatch` run or the next scheduled tick, read from the Actions log |
| 3 | Whether `truncatedByBudget` has EVER been `true` in a real tick, and how low `scannedUserPrefixes` has gone - both fields exist in the response body today (`route.ts:130,135`) but are never read by the alerting workflow (section 3's canary: `grep -n "truncatedByBudget\|scannedUserPrefixes" .github/workflows/sweep-orphan-uploads.yml` matches only comment text) | Repo owner, or whoever wires the workflow to read these fields | The response body already in the Actions log (`cat /tmp/resp.json`, `sweep-orphan-uploads.yml`'s existing step) - readable today, with NO new instrument and NO wait for a G3 fix | Object: `truncatedByBudget` and `scannedUserPrefixes` across recent ticks in the existing Actions run history. Failure direction: any `true`/low value found retroactively means the SILENT under-scanning failure mode in section 3 has already been happening, unflagged, independent of whether the 250ms assumption itself is ever corrected | A one-time read of recent Actions run logs via the web UI - possible immediately, does not require section 4's new instrument |
| 4 | Whether wiring `truncatedByBudget`/`scannedUserPrefixes` into the workflow's alerting (even as a `::warning::`, matching the pattern already used for `listingErrors` at `sweep-orphan-uploads.yml`'s MJ-2 block) should happen independently of, and likely before, any re-sizing of the 250ms-derived constants | Whoever scopes the next chunk on this area - a product/cost call named in section 5, not resolved here | N/A - this is a design/prioritization question, not a measurement | Object: the workflow's own alerting completeness. Failure direction: leaving it unwired means residual 3's answer, whatever it is, stays invisible to the one alert this deployment has, going forward as well as retroactively | The next scoping/implementation pass on this area, informed by residual 3's answer |
| 5 | Whether Supabase's own project-level request logs (dashboard "Logs" feature) already expose per-call latency without any code change - a possible shortcut past residual 1's instrument-then-deploy path | Repo owner (needs Supabase dashboard access this checkout does not have) | The Supabase project dashboard, Logs section, if it exists on the project's plan - UNVERIFIED from here, named as a thing to check rather than a confirmed capability | Object: whether such a log view exists and whether it isolates Storage `.list()`/`.remove()` calls for this bucket. Failure direction: if it does not exist or does not isolate the right calls, residual 1's instrument-and-deploy path is the only route, which changes the cost of measuring this at all | A one-time owner check of the Supabase dashboard before committing to building the code-level instrument |

**Recommendation:** do not guess a replacement number for 250ms. Section 5
argues the constant is a one-time sizing input rather than a live
parameter, so the highest-leverage next step is NOT re-measuring 250ms
directly but **residual 3 first** - reading what the response body already
contains in recent ticks, which costs nothing new and may already show
whether silent under-scanning (section 3) has been happening - followed by
**residual 2** (also free: the root-prefix count is already in every tick's
body), before deciding whether building the new timing instrument
(residual 1) is worth the work section 4 describes. `G3` should stay
`unscoped` until at least residual 3 is read: if it comes back showing
`truncatedByBudget` has never fired and `scannedUserPrefixes` has stayed
near the expected range, that is real evidence the 250ms assumption has not
yet mattered in practice, which changes how urgent this row is relative to
the rest of the backlog - a judgment this document deliberately leaves to
the owner rather than making for them.

---

## Verification of this document

- Byte check: `tr -d -c '\000' < docs/g3-scope.md | wc -c` must return `0`
  (no NUL bytes, per `src/source-bytes.structure.test.ts`).
- ASCII check: this file was written in plain ASCII throughout (no
  em/en-dashes, curly quotes, or other non-ASCII punctuation) - verified by
  the byte/structure tests below, not by eye alone.
- Gates run for this pass:
  `npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts`,
  exit code and `git status --short` recorded in the hand-off message, not
  in this file, since this file's own byte content is part of what is
  being checked.
